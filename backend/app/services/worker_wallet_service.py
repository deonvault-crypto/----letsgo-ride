from __future__ import annotations

from typing import Any, Dict, List

from app.database import database
from app.services.worker_finance_service import list_payout_methods, wallet_summary as legacy_wallet_summary


DRIVER_LEDGER_LIMIT = 100
DRIVER_PAYOUT_HISTORY_LIMIT = 50
CARD_SETTLED_STATUSES = {"paid"}


def _money(value: Any) -> float:
    try:
        return round(float(value or 0), 2)
    except (TypeError, ValueError):
        return 0.0


def _trip_finance(trip: Dict[str, Any]) -> Dict[str, Any]:
    """Apply the LetsGoRide launch economics to an immutable trip fare snapshot.

    Cash is collected directly by the driver and belongs to the driver in full.
    LetsGoRide only recognizes its configured platform percentage on settled card
    payments. The fare snapshot remains the source of truth for historical card
    economics so later pricing changes cannot rewrite completed-trip accounting.
    """

    fare = trip.get("fare") or {}
    gross = _money(fare.get("total_fare"))
    payment_method = str(trip.get("payment_method") or "cash").strip().lower()
    payment_status = str(trip.get("payment_status") or "").strip().lower()

    if payment_method == "cash":
        return {
            "gross": gross,
            "commission": 0.0,
            "worker_earnings": gross,
            "payment_method": "cash",
            "settlement_state": "cash_kept_by_driver",
            "recognized": True,
        }

    quoted_commission = min(gross, _money(fare.get("platform_commission")))
    worker_earnings = _money(max(0.0, gross - quoted_commission))
    settled = payment_status in CARD_SETTLED_STATUSES
    if settled:
        settlement_state = "card_settled"
    elif payment_status in {"failed", "cancelled", "canceled"}:
        settlement_state = "payment_recovery"
    else:
        settlement_state = "payment_pending"
    return {
        "gross": gross,
        "commission": quoted_commission,
        "worker_earnings": worker_earnings,
        "payment_method": payment_method or "card",
        "settlement_state": settlement_state,
        "recognized": settled,
    }


async def _driver_totals(user_id: str) -> Dict[str, float]:
    """Calculate lifetime totals without materializing lifetime trip history in production."""

    if database.db is None:
        rows = await database.find_many(
            "hailing_trips",
            {"driver_user_id": user_id, "status": "COMPLETED"},
        )
        gross = net = cash = digital = commission = 0.0
        for trip in rows:
            finance = _trip_finance(trip)
            gross += finance["gross"]
            if finance["payment_method"] == "cash":
                cash += finance["gross"]
                net += finance["worker_earnings"]
            elif finance["recognized"]:
                digital += finance["worker_earnings"]
                commission += finance["commission"]
                net += finance["worker_earnings"]
        return {
            "gross": _money(gross),
            "net": _money(net),
            "cash": _money(cash),
            "digital": _money(digital),
            "commission": _money(commission),
        }

    pipeline = [
        {"$match": {"driver_user_id": user_id, "status": "COMPLETED"}},
        {
            "$project": {
                "gross": {"$ifNull": ["$fare.total_fare", 0]},
                "quoted_commission": {"$ifNull": ["$fare.platform_commission", 0]},
                "payment_method": {"$toLower": {"$ifNull": ["$payment_method", "cash"]}},
                "payment_status": {"$toLower": {"$ifNull": ["$payment_status", ""]}},
            }
        },
        {
            "$group": {
                "_id": None,
                "gross": {"$sum": "$gross"},
                "cash": {
                    "$sum": {"$cond": [{"$eq": ["$payment_method", "cash"]}, "$gross", 0]}
                },
                "settled_card_gross": {
                    "$sum": {
                        "$cond": [
                            {
                                "$and": [
                                    {"$ne": ["$payment_method", "cash"]},
                                    {"$eq": ["$payment_status", "paid"]},
                                ]
                            },
                            "$gross",
                            0,
                        ]
                    }
                },
                "settled_card_commission": {
                    "$sum": {
                        "$cond": [
                            {
                                "$and": [
                                    {"$ne": ["$payment_method", "cash"]},
                                    {"$eq": ["$payment_status", "paid"]},
                                ]
                            },
                            "$quoted_commission",
                            0,
                        ]
                    }
                },
            }
        },
    ]
    rows = await database.db["hailing_trips"].aggregate(pipeline).to_list(length=1)
    row = rows[0] if rows else {}
    gross = _money(row.get("gross"))
    cash = _money(row.get("cash"))
    card_gross = _money(row.get("settled_card_gross"))
    commission = _money(min(card_gross, _money(row.get("settled_card_commission"))))
    digital = _money(max(0.0, card_gross - commission))
    return {
        "gross": gross,
        "net": _money(cash + digital),
        "cash": cash,
        "digital": digital,
        "commission": commission,
    }


async def _driver_wallet(user: Dict[str, Any]) -> Dict[str, Any]:
    driver = await database.find_one("drivers", {"user_id": user["id"]})
    if not driver:
        raise PermissionError("Complete your Driver profile before opening the wallet.")

    totals = await _driver_totals(str(user["id"]))
    recent = await database.find_many(
        "hailing_trips",
        {"driver_user_id": user["id"], "status": "COMPLETED"},
        sort=[("created_at", -1)],
        limit=DRIVER_LEDGER_LIMIT,
    )
    entries: List[Dict[str, Any]] = []
    for trip in recent:
        finance = _trip_finance(trip)
        entries.append(
            {
                "id": f"hailing:{trip['id']}",
                "source_type": "RIDE_NOW",
                "source_id": trip["id"],
                "label": f"Ride Now · {(trip.get('dropoff') or {}).get('formatted_address') or 'completed trip'}",
                "gross_usd": finance["gross"],
                "platform_commission_usd": finance["commission"] if finance["payment_method"] != "cash" else 0.0,
                "worker_earnings_usd": finance["worker_earnings"],
                "payment_method": finance["payment_method"],
                "settlement_state": finance["settlement_state"],
                "occurred_at": trip.get("completed_at") or trip.get("updated_at"),
            }
        )

    payouts = await database.find_many(
        "worker_payouts",
        {"user_id": user["id"], "worker_role": "driver", "status": "paid"},
        sort=[("created_at", -1)],
        limit=DRIVER_PAYOUT_HISTORY_LIMIT,
    )
    paid_out = _money(sum(_money(item.get("amount_usd")) for item in payouts))
    available = _money(max(0.0, totals["digital"] - paid_out))
    return {
        "currency": "USD",
        "worker_role": "driver",
        "available_balance_usd": available,
        "gross_earnings_usd": totals["gross"],
        "net_earnings_usd": totals["net"],
        "cash_collected_usd": totals["cash"],
        "digital_earnings_usd": totals["digital"],
        # Cash never creates a debt from the driver to LetsGoRide.
        "amount_due_to_platform_usd": 0.0,
        "platform_commission_usd": totals["commission"],
        "paid_out_usd": paid_out,
        "ledger": entries,
        "payout_history": payouts,
        "payout_methods": await list_payout_methods(user),
        "settlement_integrated": False,
        "cash_policy": "driver_keeps_100_percent",
        "platform_fee_policy": "card_only",
    }


async def wallet_summary(user: Dict[str, Any]) -> Dict[str, Any]:
    role = str(user.get("role") or "").strip().lower()
    if role == "driver":
        return await _driver_wallet(user)
    # Courier economics are a separate product contract. Preserve them until that
    # contract is intentionally changed rather than silently applying driver rules.
    return await legacy_wallet_summary(user)
