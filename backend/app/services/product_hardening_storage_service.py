from __future__ import annotations

from app.database import database


async def ensure_product_hardening_indexes() -> None:
    """Create indexes owned by the new hardening domains without mutating data."""
    if database.db is None:
        return
    await database.db["worker_payout_methods"].create_index(
        [("user_id", 1), ("worker_role", 1), ("status", 1), ("is_default", -1)],
        name="worker_payout_methods_by_owner",
    )
    await database.db["worker_payouts"].create_index(
        [("user_id", 1), ("worker_role", 1), ("status", 1), ("created_at", -1)],
        name="worker_payout_history",
    )
    await database.db["hailing_share_links"].create_index(
        [("token_hash", 1)],
        name="unique_hailing_share_token",
        unique=True,
    )
    await database.db["hailing_share_links"].create_index(
        [("trip_id", 1), ("status", 1), ("expires_at", 1)],
        name="hailing_share_by_trip",
    )
    await database.db["reviews"].create_index(
        [("transaction_id", 1), ("transaction_type", 1), ("reviewer_id", 1), ("reviewee_id", 1)],
        name="unique_transaction_review",
        unique=True,
        partialFilterExpression={"transaction_id": {"$type": "string"}, "transaction_type": {"$type": "string"}},
    )
    await database.db["reviews"].create_index(
        [("reviewee_id", 1), ("reviewee_kind", 1), ("created_at", -1)],
        name="public_reviews_by_target",
    )
