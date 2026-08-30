from __future__ import annotations

import asyncio
import logging
from typing import Dict

from app.services.database_scale_service import find_many_bounded
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


async def sweep_ride_lifecycle_scaled() -> Dict[str, int]:
    """Inspect only transitionable rides, ordered and bounded by the lifecycle index."""
    rides = await find_many_bounded(
        "rides",
        {"status": {"$in": TRANSITIONABLE_RIDE_STATUSES}},
        sort=[("date", 1), ("time", 1)],
        limit=RIDE_LIFECYCLE_BATCH,
    )
    changed = 0
    checked = 0
    for ride in rides:
        if not is_public_ride(ride):
            continue
        checked += 1
        before = canonical_trip_status(ride.get("status"))
        updated = await apply_ride_lifecycle(ride)
        if before != canonical_trip_status(updated.get("status")):
            changed += 1
    return {"checked": checked, "changed": changed}


async def ride_lifecycle_sweeper_scaled(stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        try:
            await sweep_ride_lifecycle_scaled()
        except Exception as exc:
            logger.warning("ride_lifecycle_scale_sweep_failed error_type=%s", exc.__class__.__name__)
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=60)
        except asyncio.TimeoutError:
            continue
