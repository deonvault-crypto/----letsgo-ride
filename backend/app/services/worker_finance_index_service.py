from __future__ import annotations

from app.database import database


async def ensure_worker_finance_indexes() -> None:
    """Index durable worker-finance and weekly driver-settlement reads."""

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
    await database.db["driver_fee_statements"].create_index(
        [("statement_key", 1)],
        name="unique_driver_fee_statement",
        unique=True,
    )
    await database.db["driver_fee_statements"].create_index(
        [("driver_user_id", 1), ("status", 1), ("issued_at", 1)],
        name="driver_fee_statements_by_driver_status",
    )
    await database.db["driver_fee_statements"].create_index(
        [("status", 1), ("grace_ends_at", 1)],
        name="driver_fee_statements_due_work",
    )
    await database.db["driver_fee_statements"].create_index(
        [("stripe_payment_intent_id", 1)],
        name="unique_driver_fee_payment_intent",
        unique=True,
        sparse=True,
    )
