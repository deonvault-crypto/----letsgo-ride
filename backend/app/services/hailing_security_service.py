from __future__ import annotations

import logging

from app.database import database
from app.utils import now_iso


logger = logging.getLogger(__name__)


async def clear_legacy_plaintext_hailing_pins() -> int:
    """Remove legacy readable Ride Now PIN values without changing their hash record."""
    trips = await database.find_many("hailing_trips")
    changed = 0
    for trip in trips:
        if trip.get("plain_trip_pin") is None:
            continue
        await database.update_one(
            "hailing_trips",
            trip["id"],
            {"plain_trip_pin": None, "updated_at": now_iso()},
        )
        changed += 1
    if changed:
        logger.info("hailing_legacy_plaintext_pins_cleared count=%s", changed)
    return changed
