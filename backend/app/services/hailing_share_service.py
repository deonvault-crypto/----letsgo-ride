from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict
from urllib.parse import quote

from app.config import get_settings
from app.database import database
from app.services.hailing_state import FINAL_STATUSES
from app.utils import new_id, now_iso


SHAREABLE_STATUSES = {
    "DRIVER_ASSIGNED",
    "DRIVER_EN_ROUTE",
    "DRIVER_ARRIVED",
    "PASSENGER_CONFIRMED_BOARDING",
    "IN_PROGRESS",
}
SHARE_LINK_MAX_HOURS = 24
SHARE_LINK_FINAL_GRACE_MINUTES = 30


def _ensure_memory_collections() -> None:
    if database.db is None:
        database.memory.setdefault("hailing_share_links", [])


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _parse_time(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _first_name(value: Any) -> str:
    parts = [part for part in str(value or "Driver").strip().split() if part]
    return parts[0] if parts else "Driver"


def _public_tracking_payload(trip: Dict[str, Any]) -> Dict[str, Any]:
    driver = trip.get("driver_snapshot") or {}
    vehicle = trip.get("vehicle_snapshot") or {}
    return {
        "trip_id": trip.get("id"),
        "status": trip.get("status"),
        "ride_class": trip.get("ride_class"),
        "pickup": {
            "formatted_address": (trip.get("pickup") or {}).get("formatted_address"),
            "latitude": (trip.get("pickup") or {}).get("latitude"),
            "longitude": (trip.get("pickup") or {}).get("longitude"),
        },
        "dropoff": {
            "formatted_address": (trip.get("dropoff") or {}).get("formatted_address"),
            "latitude": (trip.get("dropoff") or {}).get("latitude"),
            "longitude": (trip.get("dropoff") or {}).get("longitude"),
        },
        "route": {
            "distance_km": (trip.get("route") or {}).get("distance_km"),
            "duration_seconds": (trip.get("route") or {}).get("duration_seconds"),
            "estimated_duration_minutes": (trip.get("route") or {}).get("estimated_duration_minutes"),
            "encoded_polyline": (trip.get("route") or {}).get("encoded_polyline") or (trip.get("route") or {}).get("polyline"),
        },
        "driver": {
            "first_name": _first_name(driver.get("name")),
            "rating": driver.get("rating"),
            "profile_photo_url": driver.get("profile_photo_url"),
        },
        "vehicle": {
            "make": vehicle.get("make"),
            "model": vehicle.get("model"),
            "color": vehicle.get("color"),
            "plate_number": vehicle.get("plate_number") or vehicle.get("plate"),
        },
        "driver_location": trip.get("driver_location"),
        "assigned_at": trip.get("assigned_at"),
        "arrived_at": trip.get("arrived_at"),
        "started_at": trip.get("started_at"),
        "completed_at": trip.get("completed_at"),
        "cancelled_at": trip.get("cancelled_at"),
        "updated_at": trip.get("updated_at"),
    }


def _effective_expiry(link: Dict[str, Any], trip: Dict[str, Any]) -> datetime | None:
    configured = _parse_time(link.get("expires_at"))
    if trip.get("status") not in FINAL_STATUSES:
        return configured
    final_time = _parse_time(trip.get("completed_at") or trip.get("cancelled_at") or trip.get("updated_at"))
    if not final_time:
        return configured
    graceful = final_time + timedelta(minutes=SHARE_LINK_FINAL_GRACE_MINUTES)
    return min(configured, graceful) if configured else graceful


async def create_trip_share(trip_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    _ensure_memory_collections()
    trip = await database.find_one("hailing_trips", {"id": trip_id})
    if not trip:
        raise ValueError("Ride Now trip not found.")
    if trip.get("passenger_user_id") != user.get("id"):
        raise PermissionError("Only the passenger can share this trip.")
    if trip.get("status") not in SHAREABLE_STATUSES:
        raise ValueError("Trip sharing becomes available after a driver is assigned and closes shortly after the ride ends.")

    timestamp = now_iso()
    await database.update_many(
        "hailing_share_links",
        {"trip_id": trip_id, "status": "active"},
        {"status": "revoked", "revoked_at": timestamp, "updated_at": timestamp},
    )

    token = secrets.token_urlsafe(24)
    expires_at = (datetime.now(timezone.utc) + timedelta(hours=SHARE_LINK_MAX_HOURS)).isoformat()
    await database.insert_one(
        "hailing_share_links",
        {
            "id": new_id(),
            "trip_id": trip_id,
            "passenger_user_id": user["id"],
            "token_hash": _token_hash(token),
            "status": "active",
            "expires_at": expires_at,
            "created_at": timestamp,
            "updated_at": timestamp,
        },
    )

    settings = get_settings()
    site = settings.public_site_base_url.rstrip("/")
    api_origin = settings.public_api_base_url.rstrip("/")
    share_url = f"{site}/t/?token={quote(token, safe='')}&api={quote(api_origin, safe='')}"
    return {
        "share_url": share_url,
        "expires_at": expires_at,
        "status": trip.get("status"),
    }


async def public_trip_share(token: str) -> Dict[str, Any]:
    _ensure_memory_collections()
    clean = token.strip()
    if len(clean) < 20 or len(clean) > 128:
        raise ValueError("This shared trip link is invalid or expired.")
    link = await database.find_one("hailing_share_links", {"token_hash": _token_hash(clean), "status": "active"})
    if not link:
        raise ValueError("This shared trip link is invalid or expired.")
    trip = await database.find_one("hailing_trips", {"id": link.get("trip_id")})
    if not trip:
        raise ValueError("This shared trip link is no longer available.")
    expiry = _effective_expiry(link, trip)
    if not expiry or expiry <= datetime.now(timezone.utc):
        await database.update_one("hailing_share_links", link["id"], {"status": "expired", "updated_at": now_iso()})
        raise ValueError("This shared trip link has expired.")
    return {
        **_public_tracking_payload(trip),
        "share_expires_at": expiry.isoformat(),
    }
