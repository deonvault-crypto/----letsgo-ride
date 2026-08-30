from __future__ import annotations

import asyncio
import logging
from typing import Dict

from app.database import database
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


async def reconcile_hailing_card_payments_bounded() -> Dict[str, int]:
    """Reconcile only unresolved terminal card rides in small indexed batches.

    Stripe webhooks remain primary. This is a restrained recovery path for missed
    webhooks/provider hiccups, not a recurring scan of historical settled rides.
    """
    completed = await database.find_many(
        "hailing_trips",
        {
            "payment_method": "card",
            "status": "COMPLETED",
            "payment_status": {"$in": UNRESOLVED_PAYMENT_STATUSES},
        },
        sort=[("updated_at", 1)],
        limit=STRIPE_RECONCILIATION_BATCH,
    )
    cancelled = await database.find_many(
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
        next_status = await cancel_hailing_card_authorization(
            trip,
            str(trip.get("status") or "").lower(),
        )
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


async def stripe_payment_reconciliation_sweeper_bounded(stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        try:
            await reconcile_hailing_card_payments_bounded()
        except Exception as exc:
            logger.warning(
                "stripe_payment_reconciliation_failed error_type=%s",
                exc.__class__.__name__,
            )
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=STRIPE_RECONCILIATION_SECONDS)
        except asyncio.TimeoutError:
            continue
