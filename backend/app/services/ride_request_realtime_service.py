from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, List, Optional

from app.database import database
from app.models.event import RealtimeAudience
from app.services.event_service import realtime_event_service
from app.services.ride_realtime_service import safe_ride_payload


logger = logging.getLogger(__name__)
TERMINAL_REQUEST_STATUSES = {
    "declined", "cancelled", "cancelled_by_passenger", "cancelled_by_driver", "cancelled_by_admin",
}


def ride_request_realtime_version(request: Dict[str, Any] | None) -> int:
    value = (request or {}).get("realtime_version", 0)
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else 0


async def insert_versioned_ride_request(request: Dict[str, Any]) -> Dict[str, Any]:
    return await database.insert_one("ride_requests", {**request, "realtime_version": 1})


async def update_versioned_ride_request(filters: Dict[str, Any], updates: Dict[str, Any]) -> Dict[str, Any] | None:
    return await database.update_one_atomic(
        "ride_requests", filters, updates, {"realtime_version": 1},
    )


def safe_ride_request_payload(request: Dict[str, Any], ride: Dict[str, Any] | None = None) -> Dict[str, Any]:
    snapshot = ride or request.get("ride_snapshot")
    safe_snapshot = safe_ride_payload(snapshot) if isinstance(snapshot, dict) else None
    if safe_snapshot:
        safe_snapshot["last_driver_location"] = None
        safe_snapshot["live_tracking_active"] = False
    return {
        "id": request.get("id"),
        "realtime_version": ride_request_realtime_version(request),
        "ride_id": request.get("ride_id"),
        "user_id": request.get("user_id"),
        "passenger_name": request.get("passenger_name"),
        "passenger_profile_photo_url": request.get("passenger_profile_photo_url"),
        "passenger_verification_status": request.get("passenger_verification_status"),
        "passenger_note": request.get("passenger_note"),
        "seats": request.get("seats"),
        "status": request.get("status"),
        "checked_in": bool(request.get("checked_in")),
        "checked_in_at": request.get("checked_in_at"),
        "driver_decision_reason": request.get("driver_decision_reason"),
        "cancellation_reason": request.get("cancellation_reason"),
        "driver_cancellation_reason": request.get("driver_cancellation_reason"),
        "admin_cancellation_reason": request.get("admin_cancellation_reason"),
        "ride_snapshot": safe_snapshot,
        "created_at": request.get("created_at"),
        "updated_at": request.get("updated_at"),
    }


def request_audience(request: Dict[str, Any], ride: Dict[str, Any]) -> RealtimeAudience:
    user_ids = frozenset(
        item for item in (
            str(request.get("user_id") or ""),
            str(ride.get("user_id") or ""),
        ) if item
    )
    return RealtimeAudience(user_ids=user_ids, roles=frozenset({"admin"}))


async def publish_ride_request_realtime(
    request: Dict[str, Any],
    ride: Dict[str, Any],
    event_type: str,
) -> bool:
    try:
        published = await realtime_event_service.publish(
            realtime_event_service.build_event(
                event_type=event_type,
                resource_type="ride_request",
                resource_id=str(request.get("id") or ""),
                version=ride_request_realtime_version(request),
                audience=request_audience(request, ride),
                payload=safe_ride_request_payload(request, ride),
            )
        )
        if not published:
            logger.warning(
                "ride_request_realtime_unavailable request_id=%s version=%s",
                request.get("id"), ride_request_realtime_version(request),
            )
        return published
    except Exception as exc:
        logger.warning(
            "ride_request_realtime_publish_failed request_id=%s version=%s error=%s",
            request.get("id"), ride_request_realtime_version(request), type(exc).__name__,
        )
        return False


def ride_request_event_type(request: Dict[str, Any], *, created: bool = False) -> str:
    if created:
        return "ride_request.created"
    if str(request.get("status") or "") in TERMINAL_REQUEST_STATUSES:
        return "ride_request.terminal"
    return "ride_request.updated"


async def enrich_ride_requests(
    requests: List[Dict[str, Any]],
    user: Dict[str, Any],
    *,
    rides_by_id: Optional[Dict[str, Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    from app.services.ride_service import enrich_ride

    ride_ids = sorted({str(request.get("ride_id")) for request in requests if request.get("ride_id")})
    passenger_ids = sorted({str(request.get("user_id")) for request in requests if request.get("user_id")})

    if rides_by_id is None:
        rides = await database.find_many("rides", {"id": {"$in": ride_ids}}) if ride_ids else []
        rides_by_id = {str(ride.get("id")): ride for ride in rides if ride.get("id")}

    passengers = await database.find_many("users", {"id": {"$in": passenger_ids}}) if passenger_ids else []
    passengers_by_id = {str(passenger.get("id")): passenger for passenger in passengers if passenger.get("id")}

    ride_snapshots = await asyncio.gather(
        *(enrich_ride(rides_by_id[ride_id], user) for ride_id in ride_ids if ride_id in rides_by_id),
    )
    snapshots_by_id = {str(snapshot.get("id")): snapshot for snapshot in ride_snapshots if snapshot.get("id")}

    enriched_requests = []
    for request in requests:
        enriched = dict(request)
        ride_snapshot = snapshots_by_id.get(str(request.get("ride_id") or ""))
        passenger = passengers_by_id.get(str(request.get("user_id") or ""))
        if ride_snapshot:
            enriched["ride_snapshot"] = ride_snapshot
        if passenger:
            enriched["passenger_name"] = passenger.get("name") or request.get("passenger_name")
            enriched["passenger_profile_photo_url"] = passenger.get("profile_photo_url") or request.get("passenger_profile_photo_url")
            enriched["passenger_verification_status"] = passenger.get("verification_status") or request.get("passenger_verification_status")
        enriched.pop("passenger_phone", None)
        enriched_requests.append(enriched)
    return enriched_requests


async def enrich_ride_request(request: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    return (await enrich_ride_requests([request], user))[0]


async def list_driver_ride_requests(user: Dict[str, Any]) -> List[Dict[str, Any]]:
    rides = await database.find_many("rides", {"user_id": user.get("id")})
    rides_by_id = {str(ride.get("id")): ride for ride in rides if ride.get("id")}
    requests = await database.find_many("ride_requests", {"ride_id": {"$in": sorted(rides_by_id)}}) if rides_by_id else []
    scoped = [request for request in requests if request.get("user_id") != user.get("id")]
    return await enrich_ride_requests(scoped, user, rides_by_id=rides_by_id)
