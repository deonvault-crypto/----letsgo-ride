from __future__ import annotations

import asyncio
import logging
from typing import Dict

from app.database import database
from app.services.ride_service import apply_ride_lifecycle, canonical_trip_status, is_public_ride


logger = logging.getLogger(__name__)
RIDE_LIFECYCLE_BATCH = 500
TRANSITIONABLE_RIDE_STATUSES = [
    "SCHEDULED",
    "BOARDING",
    "IN_PROGRESS",
    "OPEN",
    "open",
    "DEPARTED",
    "departed",
]


async def sweep_ride_lifecycle_bounded() -> Dict[str, int]:
    """Inspect only transitionable rides instead of historical terminal rows."""
    rides = await database.find_many(
        "rides",
        {"status": {"$in": TRANSITIONABLE_RIDE_STATUSES}},
        sort=[("date", 1), ("time", 1)],
        limit=RIDE_LIFECYCLE_BATCH,
    )
    checked = 0
    changed = 0
    for ride in rides:
        if not is_public_ride(ride):
            continue
        checked += 1
        before = canonical_trip_status(ride.get("status"))
        updated = await apply_ride_lifecycle(ride)
        if before != canonical_trip_status(updated.get("status")):
            changed += 1
    return {"checked": checked, "changed": changed}


async def ride_lifecycle_sweeper_bounded(stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        try:
            await sweep_ride_lifecycle_bounded()
        except Exception as exc:
            logger.warning("ride_lifecycle_sweep_failed error_type=%s", exc.__class__.__name__)
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=60)
        except asyncio.TimeoutError:
            continue
