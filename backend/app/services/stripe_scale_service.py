from __future__ import annotations

import asyncio
import logging
from typing import Dict

from app.services.database_scale_service import find_many_bounded
from app.services.hailing_realtime_service import publish_hailing_trip_realtime, update_versioned_hailing_trip
from app.services.stripe_payment_service import (
    CARD_CANCEL_STATUSES,
    cancel_hailing_card_authorization,
    capture_hailing_trip_payment,
)
from app.utils import now_iso


logger = logging.getLogger(__name__)
STRIPE_RECONCILIATION_BATCH = 50
STRIPE_RECONCILIATION_SECONDS = 15
UNRESOLVED_PAYMENT_STATUSES = [
    None,
    "pending",
    "authorized",
    "capture_pending",
    "cancel_pending",
    "failed",
]


async def reconcile_hailing_card_payments_scaled() -> Dict[str, int]:
    """Reconcile only unresolved terminal card trips in bounded indexed batches.

    Stripe webhooks are the primary state signal. This worker is deliberately a
    restrained recovery mechanism rather than a five-second scan of every card trip.
    """
    completed = await find_many_bounded(
        "hailing_trips",
        {
            "payment_method": "card",
            "status": "COMPLETED",
            "payment_status": {"$in": UNRESOLVED_PAYMENT_STATUSES},
        },
        sort=[("updated_at", 1)],
        limit=STRIPE_RECONCILIATION_BATCH,
    )
    cancelled = await find_many_bounded(
        "hailing_trips",
        {
            "payment_method": "card",
            "status": {"$in": list(CARD_CANCEL_STATUSES)},
            "payment_status": {"$in": UNRESOLVED_PAYMENT_STATUSES},
        },
        sort=[("updated_at", 1)],
        limit=STRIPE_RECONCILIATION_BATCH,
    )

    captured = 0
    released = 0
    deferred = 0

    for trip in completed:
        previous = str(trip.get("payment_status") or "")
        next_status = await capture_hailing_trip_payment(trip)
        if next_status == previous:
            continue
        updated = await update_versioned_hailing_trip(
            {"id": trip["id"]},
            {"payment_status": next_status, "updated_at": now_iso()},
        )
        if updated:
            await publish_hailing_trip_realtime(updated, "hailing.trip.payment_updated")
        if next_status == "paid":
            captured += 1
        else:
            deferred += 1

    for trip in cancelled:
        previous = str(trip.get("payment_status") or "")
        next_status = await cancel_hailing_card_authorization(trip, str(trip.get("status") or "").lower())
        if next_status == previous:
            continue
        updated = await update_versioned_hailing_trip(
            {"id": trip["id"]},
            {"payment_status": next_status, "updated_at": now_iso()},
        )
        if updated:
            await publish_hailing_trip_realtime(updated, "hailing.trip.payment_updated")
        if next_status == "cancelled":
            released += 1
        else:
            deferred += 1

    return {"captured": captured, "released": released, "deferred": deferred}


async def stripe_payment_reconciliation_sweeper_scaled(stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        try:
            await reconcile_hailing_card_payments_scaled()
        except Exception as exc:
            logger.warning("stripe_payment_scale_reconciliation_failed error_type=%s", exc.__class__.__name__)
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=STRIPE_RECONCILIATION_SECONDS)
        except asyncio.TimeoutError:
            continue
