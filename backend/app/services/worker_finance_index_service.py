from __future__ import annotations

from app.database import database


async def ensure_worker_finance_indexes() -> None:
    """Index the durable worker-finance reads without changing payout semantics."""

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
