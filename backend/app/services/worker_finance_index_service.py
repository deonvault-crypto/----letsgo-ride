from __future__ import annotations

from app.database import database


async def ensure_worker_finance_indexes() -> None:
    """Indexes for courier payout data and weekly post-paid driver settlements."""

    if database.db is None:
        return
    await database.db["worker_payouts"].create_index(
        [("user_id", 1), ("worker_role", 1), ("status", 1), ("created_at", -1)],
        name="worker_payouts_by_user_status_time",
    )
    await database.db["worker_payout_methods"].create_index(
        [("user_id", 1), ("worker_role", 1), ("status", 1), ("is_default", -1), ("created_at", 1)],
        name="worker_payout_methods_by_user",
    )
    await database.db["driver_fee_ledger"].create_index("id", unique=True, name="driver_fee_id_unique")
    await database.db["driver_fee_ledger"].create_index(
        [("statement_id", 1), ("period_end", 1), ("driver_user_id", 1)],
        name="driver_fee_unbilled_period",
    )
    await database.db["driver_fee_ledger"].create_index(
        [("driver_user_id", 1), ("period_start", 1), ("completed_at", -1)],
        name="driver_fee_by_user_period",
    )
    await database.db["driver_fee_statements"].create_index("id", unique=True, name="driver_statement_id_unique")
    await database.db["driver_fee_statements"].create_index(
        [("driver_user_id", 1), ("period_start", -1)],
        unique=True,
        name="driver_statement_user_period_unique",
    )
    await database.db["driver_fee_statements"].create_index(
        [("status", 1), ("due_at", 1)],
        name="driver_statement_status_due",
    )
    await database.db["driver_settlement_payments"].create_index("id", unique=True, name="driver_settlement_payment_id_unique")
    await database.db["driver_settlement_payments"].create_index(
        [("driver_user_id", 1), ("status", 1), ("created_at", -1)],
        name="driver_settlement_payment_by_user",
    )
    await database.db["driver_settlement_payments"].create_index(
        "stripe_payment_intent_id",
        sparse=True,
        name="driver_settlement_payment_intent",
    )
