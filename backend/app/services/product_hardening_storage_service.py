from __future__ import annotations

from app.database import database


async def ensure_product_hardening_indexes() -> None:
    """Create steady-state product and scale indexes without mutating domain data."""
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

    # Stripe webhooks are primary. This index supports the bounded reconciliation
    # safety worker without scanning settled historical card rides.
    await database.db["hailing_trips"].create_index(
        [("payment_method", 1), ("status", 1), ("payment_status", 1), ("updated_at", 1)],
        name="hailing_card_reconciliation",
    )
    await database.db["hailing_trips"].create_index(
        [("stripe_payment_intent_id", 1)],
        name="unique_hailing_stripe_intent",
        unique=True,
        partialFilterExpression={"stripe_payment_intent_id": {"$type": "string"}},
    )
    await database.db["hailing_trips"].create_index(
        [("created_at", -1)],
        name="admin_hailing_trips_recent",
    )
    await database.db["drivers"].create_index(
        [("name", 1), ("created_at", -1)],
        name="admin_hailing_drivers_page",
    )

    # Courier history stays durable, while only high-frequency GPS telemetry gets
    # a short retention window. Delivery/POD/earnings/audit documents are untouched.
    await database.db["courier_deliveries"].create_index(
        [("sender_user_id", 1), ("created_at", -1)],
        name="courier_history_by_sender",
    )
    await database.db["courier_deliveries"].create_index(
        [("courier_user_id", 1), ("created_at", -1)],
        name="courier_history_by_courier",
    )
    await database.db["courier_location_snapshots"].create_index(
        [("expires_at", 1)],
        name="courier_telemetry_ttl",
        expireAfterSeconds=0,
    )

    # High-growth user-facing histories.
    await database.db["app_notifications"].create_index(
        [("user_id", 1), ("created_at", -1)],
        name="notifications_by_user_created",
    )
    await database.db["app_notifications"].create_index(
        [("user_id", 1), ("read", 1), ("created_at", -1)],
        name="notifications_unread_by_user",
    )
    await database.db["messages"].create_index(
        [("conversation_id", 1), ("created_at", -1)],
        name="messages_by_conversation_created",
    )
    await database.db["conversations"].create_index(
        [("driver_user_id", 1), ("updated_at", -1)],
        name="conversations_by_driver",
    )
    await database.db["conversations"].create_index(
        [("passenger_id", 1), ("updated_at", -1)],
        name="conversations_by_passenger",
    )
    await database.db["food_order_events"].create_index(
        [("order_id", 1), ("created_at", -1)],
        name="food_order_events_by_order",
    )

    # Scheduled/intercity lifecycle processing only examines transitionable rides.
    await database.db["rides"].create_index(
        [("status", 1), ("date", 1), ("time", 1)],
        name="ride_lifecycle_due_work",
    )
