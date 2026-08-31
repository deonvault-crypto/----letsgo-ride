from __future__ import annotations

from typing import Any, Dict, List

from app.database import database
from app.services.driver_weekly_settlement_service import settlement_summary
from app.services.worker_finance_service import wallet_summary as legacy_wallet_summary


DRIVER_LEDGER_LIMIT = 100


def _money(value: Any) -> float:
    try:
        return round(float(value or 0), 2)
    except (TypeError, ValueError):
        return 0.0


async def _driver_lifetime_totals(user_id: str) -> Dict[str, float]:
    filters = {"driver_user_id": user_id, "status": "COMPLETED", "payment_method": "cash"}
    if database.db is None:
        trips = await database.find_many("hailing_trips", filters)
        gross = _money(sum(_money((trip.get("fare") or {}).get("total_fare")) for trip in trips))
        fees = _money(sum(_money((trip.get("fare") or {}).get("platform_commission")) for trip in trips))
        return {"gross": gross, "fees": fees, "net": _money(max(0.0, gross - fees))}
    rows = await database.db["hailing_trips"].aggregate(
        [
            {"$match": filters},
            {"$group": {"_id": None, "gross": {"$sum": {"$ifNull": ["$fare.total_fare", 0]}}, "fees": {"$sum": {"$ifNull": ["$fare.platform_commission", 0]}}}},
        ]
    ).to_list(length=1)
    row = rows[0] if rows else {}
    gross = _money(row.get("gross"))
    fees = _money(row.get("fees"))
    return {"gross": gross, "fees": fees, "net": _money(max(0.0, gross - fees))}


async def _driver_wallet(user: Dict[str, Any]) -> Dict[str, Any]:
    driver = await database.find_one("drivers", {"user_id": user["id"]})
    if not driver:
        raise PermissionError("Complete your Driver profile before opening the wallet.")
    settlement = await settlement_summary(user)
    totals = await _driver_lifetime_totals(str(user["id"]))
    recent = await database.find_many(
        "hailing_trips",
        {"driver_user_id": user["id"], "status": "COMPLETED", "payment_method": "cash"},
        sort=[("completed_at", -1), ("created_at", -1)],
        limit=DRIVER_LEDGER_LIMIT,
    )
    entries: List[Dict[str, Any]] = []
    for trip in recent:
        fare = trip.get("fare") or {}
        gross = _money(fare.get("total_fare"))
        fee = _money(fare.get("platform_commission"))
        entries.append(
            {
                "id": f"hailing:{trip['id']}",
                "source_type": "RIDE_NOW",
                "source_id": trip["id"],
                "label": f"Ride Now · {(trip.get('dropoff') or {}).get('formatted_address') or 'completed trip'}",
                "gross_usd": gross,
                "platform_commission_usd": fee,
                "worker_earnings_usd": _money(max(0.0, gross - fee)),
                "payment_method": "cash",
                "settlement_state": "weekly_fee_accrued",
                "occurred_at": trip.get("completed_at") or trip.get("updated_at"),
            }
        )
    return {
        "currency": "USD",
        "worker_role": "driver",
        "available_balance_usd": 0.0,
        "gross_earnings_usd": totals["gross"],
        "net_earnings_usd": totals["net"],
        "cash_collected_usd": totals["gross"],
        "digital_earnings_usd": 0.0,
        "amount_due_to_platform_usd": settlement["amount_due_usd"],
        "platform_commission_usd": totals["fees"],
        "paid_out_usd": 0.0,
        "ledger": entries,
        "payout_history": [],
        "payout_methods": [],
        "settlement_integrated": True,
        "cash_policy": "driver_collects_fare_directly",
        "platform_fee_policy": "weekly_postpaid",
        "driver_settlement": settlement,
    }


async def wallet_summary(user: Dict[str, Any]) -> Dict[str, Any]:
    role = str(user.get("role") or "").strip().lower()
    if role == "driver":
        return await _driver_wallet(user)
    return await legacy_wallet_summary(user)
