from __future__ import annotations

import logging
from typing import Any, Dict

from app.database import database
from app.models.event import RealtimeAudience
from app.services.event_service import realtime_event_service


logger = logging.getLogger(__name__)
TERMINAL_RIDE_STATUSES = {"COMPLETED", "CANCELLED", "EXPIRED", "completed", "cancelled", "closed"}


def ride_realtime_version(ride: Dict[str, Any] | None) -> int:
    value = (ride or {}).get("realtime_version", 0)
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else 0


async def insert_versioned_ride(ride: Dict[str, Any]) -> Dict[str, Any]:
    return await database.insert_one("rides", {**ride, "realtime_version": 1})


async def update_versioned_ride(
    filters: Dict[str, Any],
    updates: Dict[str, Any],
    increments: Dict[str, int | float] | None = None,
) -> Dict[str, Any] | None:
    return await database.update_one_atomic(
        "rides",
        filters,
        updates,
        {"realtime_version": 1, **(increments or {})},
    )


def legacy_ride_status(status: Any) -> str:
    normalized = str(status or "SCHEDULED").upper()
    return {
        "SCHEDULED": "open",
        "BOARDING": "open",
        "IN_PROGRESS": "departed",
        "COMPLETED": "completed",
        "CANCELLED": "cancelled",
        "EXPIRED": "departed",
    }.get(normalized, normalized.lower())


def safe_ride_payload(ride: Dict[str, Any]) -> Dict[str, Any]:
    status = ride.get("status")
    return {
        "id": ride.get("id"),
        "realtime_version": ride_realtime_version(ride),
        "status": status,
        "legacy_status": legacy_ride_status(status),
        "driver_user_id": ride.get("user_id"),
        "driver_name": ride.get("driver_name"),
        "vehicle": ride.get("vehicle"),
        "origin": ride.get("origin"),
        "destination": ride.get("destination"),
        "pickup_note": ride.get("pickup_note"),
        "dropoff_note": ride.get("dropoff_note"),
        "date": ride.get("date"),
        "time": ride.get("time"),
        "price_usd": ride.get("price_usd"),
        "available_seats": ride.get("available_seats"),
        "estimated_duration_minutes": ride.get("estimated_duration_minutes"),
        "live_tracking_active": bool(str(status).upper() == "IN_PROGRESS" and ride.get("live_tracking_enabled")),
        "last_driver_location": ride.get("last_driver_location") if str(status).upper() == "IN_PROGRESS" else None,
        "boarding_started_at": ride.get("boarding_started_at"),
        "started_at": ride.get("started_at"),
        "completed_at": ride.get("completed_at"),
        "cancelled_at": ride.get("cancelled_at"),
        "expired_at": ride.get("expired_at"),
        "created_at": ride.get("created_at"),
        "updated_at": ride.get("updated_at"),
    }


async def ride_audience(ride: Dict[str, Any]) -> RealtimeAudience:
    requests = await database.find_many(
        "ride_requests",
        {"ride_id": ride.get("id"), "status": "confirmed"},
    )
    user_ids = {
        str(ride.get("user_id") or ""),
        *(str(request.get("user_id") or "") for request in requests),
    }
    return RealtimeAudience(
        user_ids=frozenset(item for item in user_ids if item),
        roles=frozenset({"admin"}),
    )


async def publish_ride_realtime(ride: Dict[str, Any], event_type: str) -> bool:
    try:
        published = await realtime_event_service.publish(
            realtime_event_service.build_event(
                event_type=event_type,
                resource_type="ride",
                resource_id=str(ride.get("id") or ""),
                version=ride_realtime_version(ride),
                audience=await ride_audience(ride),
                payload=safe_ride_payload(ride),
            )
        )
        if not published:
            logger.warning("ride_realtime_unavailable ride_id=%s version=%s", ride.get("id"), ride_realtime_version(ride))
        return published
    except Exception as exc:
        logger.warning(
            "ride_realtime_publish_failed ride_id=%s version=%s error=%s",
            ride.get("id"), ride_realtime_version(ride), type(exc).__name__,
        )
        return False


def ride_event_type(ride: Dict[str, Any], *, location: bool = False, created: bool = False) -> str:
    if created:
        return "ride.created"
    if str(ride.get("status") or "").upper() in {"COMPLETED", "CANCELLED", "EXPIRED"}:
        return "ride.terminal"
    if location:
        return "ride.location_updated"
    return "ride.status_changed"
