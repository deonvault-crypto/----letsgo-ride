from __future__ import annotations

from typing import Any, Dict, List

from app.database import database
from app.services.worker_finance_service import list_payout_methods


COURIER_LEDGER_LIMIT = 100
COURIER_PAYOUT_HISTORY_LIMIT = 50


def _money(value: Any) -> float:
    try:
        return round(float(value or 0), 2)
    except (TypeError, ValueError):
        return 0.0


async def _lifetime_delivery_earnings(user_id: str) -> float:
    filters = {"courier_user_id": user_id, "status": "DELIVERED"}
    if database.db is None:
        rows = await database.find_many("courier_deliveries", filters)
        return round(sum(_money(row.get("courier_payout_usd")) for row in rows), 2)
    result = await database.db["courier_deliveries"].aggregate(
        [
            {"$match": filters},
            {"$group": {"_id": None, "amount": {"$sum": {"$ifNull": ["$courier_payout_usd", 0]}}}},
        ]
    ).to_list(length=1)
    return _money(result[0].get("amount")) if result else 0.0


async def _paid_out_total(user_id: str) -> float:
    filters = {"user_id": user_id, "worker_role": "courier", "status": "paid"}
    if database.db is None:
        rows = await database.find_many("worker_payouts", filters)
        return round(sum(_money(row.get("amount_usd")) for row in rows), 2)
    result = await database.db["worker_payouts"].aggregate(
        [
            {"$match": filters},
            {"$group": {"_id": None, "amount": {"$sum": {"$ifNull": ["$amount_usd", 0]}}}},
        ]
    ).to_list(length=1)
    return _money(result[0].get("amount")) if result else 0.0


async def _recent_deliveries(user_id: str) -> List[Dict[str, Any]]:
    filters = {"courier_user_id": user_id, "status": "DELIVERED"}
    if database.db is None:
        rows = await database.find_many("courier_deliveries", filters)
        rows.sort(key=lambda row: str(row.get("delivered_at") or row.get("updated_at") or ""), reverse=True)
        return rows[:COURIER_LEDGER_LIMIT]

    # Current delivery records carry delivered_at. Keep a bounded legacy fallback
    # for older rows that predate that timestamp, then merge by the original
    # delivered_at-or-updated_at ordering contract.
    current = await database.find_many(
        "courier_deliveries",
        {**filters, "delivered_at": {"$exists": True}},
        sort=[("delivered_at", -1)],
        limit=COURIER_LEDGER_LIMIT,
    )
    legacy = await database.find_many(
        "courier_deliveries",
        {**filters, "delivered_at": {"$exists": False}},
        sort=[("updated_at", -1)],
        limit=COURIER_LEDGER_LIMIT,
    )
    rows = [*current, *legacy]
    rows.sort(key=lambda row: str(row.get("delivered_at") or row.get("updated_at") or ""), reverse=True)
    return rows[:COURIER_LEDGER_LIMIT]


async def courier_wallet_summary(user: Dict[str, Any]) -> Dict[str, Any]:
    user_id = str(user.get("id") or "")
    if str(user.get("role") or "").strip().lower() != "courier":
        raise PermissionError("A Courier account is required.")

    accrued = await _lifetime_delivery_earnings(user_id)
    paid_out = await _paid_out_total(user_id)
    deliveries = await _recent_deliveries(user_id)
    payouts = await database.find_many(
        "worker_payouts",
        {"user_id": user_id, "worker_role": "courier", "status": "paid"},
        sort=[("created_at", -1)],
        limit=COURIER_PAYOUT_HISTORY_LIMIT,
    )

    entries: List[Dict[str, Any]] = []
    for delivery in deliveries:
        payout = _money(delivery.get("courier_payout_usd"))
        entries.append(
            {
                "id": f"courier:{delivery['id']}",
                "source_type": "FOOD_DELIVERY" if delivery.get("source_type") == "FOOD_ORDER" else "COURIER_DELIVERY",
                "source_id": delivery["id"],
                "label": f"Delivery · {delivery.get('dropoff_address') or 'completed job'}",
                "gross_usd": _money(delivery.get("price_usd")),
                "platform_commission_usd": None,
                "worker_earnings_usd": payout,
                "payment_method": None,
                "settlement_state": "accrued",
                "occurred_at": delivery.get("delivered_at") or delivery.get("updated_at"),
            }
        )

    available = max(0.0, round(accrued - paid_out, 2))
    return {
        "currency": "USD",
        "worker_role": "courier",
        "available_balance_usd": available,
        "gross_earnings_usd": round(accrued, 2),
        "net_earnings_usd": round(accrued, 2),
        "cash_collected_usd": 0.0,
        "digital_earnings_usd": round(accrued, 2),
        "amount_due_to_platform_usd": 0.0,
        "platform_commission_usd": 0.0,
        "paid_out_usd": round(paid_out, 2),
        "ledger": entries,
        "payout_history": payouts,
        "payout_methods": await list_payout_methods(user),
        "settlement_integrated": False,
    }
