from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from app.database import database
from app.utils import now_iso


COURIER_PRESENCE_STALE_SECONDS = 180
COURIER_OFFER_RADIUS_METERS = 15_000
COURIER_GEO_CANDIDATE_LIMIT = 40


def courier_geo_point(location: Dict[str, Any] | None) -> Dict[str, Any] | None:
    if not isinstance(location, dict):
        return None
    latitude = location.get("latitude")
    longitude = location.get("longitude")
    if not isinstance(latitude, (int, float)) or not isinstance(longitude, (int, float)):
        return None
    if not (-90 <= float(latitude) <= 90 and -180 <= float(longitude) <= 180):
        return None
    return {"type": "Point", "coordinates": [float(longitude), float(latitude)]}


def courier_presence_cutoff() -> str:
    return (datetime.now(timezone.utc) - timedelta(seconds=COURIER_PRESENCE_STALE_SECONDS)).isoformat()


async def update_courier_presence(user: Dict[str, Any], location: Dict[str, Any]) -> Dict[str, Any]:
    if user.get("role") != "courier":
        raise PermissionError("A Courier account is required to share work presence.")
    profile = await database.find_one("courier_profiles", {"user_id": user.get("id")})
    if not profile or profile.get("status") != "APPROVED":
        raise PermissionError("Approved courier verification is required before sharing work presence.")
    if not profile.get("online"):
        raise PermissionError("Go online before sharing Courier availability.")
    point = courier_geo_point(location)
    if not point:
        raise ValueError("A valid Courier location is required.")
    timestamp = now_iso()
    updated = await database.update_one(
        "courier_profiles",
        profile["id"],
        {
            "location": point,
            "location_accuracy": location.get("accuracy"),
            "location_heading": location.get("heading"),
            "location_speed": location.get("speed"),
            "last_seen_at": timestamp,
            "updated_at": timestamp,
        },
    )
    if not updated:
        raise ValueError("Courier profile not found.")
    return updated


async def clear_courier_presence(user_id: str) -> None:
    profile = await database.find_one("courier_profiles", {"user_id": user_id})
    if not profile:
        return
    await database.update_one(
        "courier_profiles",
        profile["id"],
        {
            "location": None,
            "last_seen_at": None,
            "updated_at": now_iso(),
        },
    )
