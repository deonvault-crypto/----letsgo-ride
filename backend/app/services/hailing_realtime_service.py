from __future__ import annotations

import logging
from typing import Any, Dict

from app.database import database
from app.services.event_service import realtime_event_service


logger = logging.getLogger(__name__)


def hailing_realtime_version(trip: Dict[str, Any] | None) -> int:
    value = (trip or {}).get("realtime_version", 0)
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else 0


async def update_versioned_hailing_trip(
    filters: Dict[str, Any],
    updates: Dict[str, Any],
    increments: Dict[str, int | float] | None = None,
) -> Dict[str, Any] | None:
    return await database.update_one_atomic(
        "hailing_trips",
        filters,
        updates,
        {"realtime_version": 1, **(increments or {})},
    )


def safe_hailing_trip_payload(trip: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": trip.get("id"),
        "realtime_version": hailing_realtime_version(trip),
        "status": trip.get("status"),
        "city_id": trip.get("city_id"),
        "ride_class": trip.get("ride_class"),
        "passenger_user_id": trip.get("passenger_user_id"),
        "driver_user_id": trip.get("driver_user_id"),
        "pickup": trip.get("pickup"),
        "dropoff": trip.get("dropoff"),
        "route": trip.get("route"),
        "fare": trip.get("fare"),
        "driver": trip.get("driver_snapshot"),
        "vehicle": trip.get("vehicle_snapshot"),
        "driver_location": trip.get("driver_location") if trip.get("status") in {"DRIVER_EN_ROUTE", "DRIVER_ARRIVED", "PASSENGER_CONFIRMED_BOARDING", "IN_PROGRESS"} else None,
        "created_at": trip.get("created_at"),
        "updated_at": trip.get("updated_at"),
        "assigned_at": trip.get("assigned_at"),
        "arrived_at": trip.get("arrived_at"),
        "started_at": trip.get("started_at"),
        "completed_at": trip.get("completed_at"),
        "cancelled_at": trip.get("cancelled_at"),
    }


async def publish_hailing_trip_realtime(trip: Dict[str, Any], event_type: str) -> bool:
    user_ids = {str(trip.get("passenger_user_id") or ""), str(trip.get("driver_user_id") or "")}
    try:
        published = await realtime_event_service.publish_user_event(
            event_type=event_type,
            resource_type="hailing_trip",
            resource_id=str(trip.get("id") or ""),
            version=hailing_realtime_version(trip),
            user_ids=(item for item in user_ids if item),
            payload=safe_hailing_trip_payload(trip),
        )
        if not published:
            logger.warning("hailing_realtime_unavailable trip_id=%s version=%s", trip.get("id"), hailing_realtime_version(trip))
        return published
    except Exception as exc:
        logger.warning(
            "hailing_realtime_publish_failed trip_id=%s version=%s error=%s",
            trip.get("id"), hailing_realtime_version(trip), type(exc).__name__,
        )
        return False


async def publish_hailing_driver_offer_realtime(
    offer: Dict[str, Any],
    event_type: str,
    *,
    version: int,
) -> bool:
    """Publish offer lifecycle changes only to the driver who owns the offer."""
    driver_user_id = str(offer.get("driver_user_id") or "")
    offer_id = str(offer.get("id") or "")
    if not driver_user_id or not offer_id:
        return False
    try:
        published = await realtime_event_service.publish_user_event(
            event_type=event_type,
            resource_type="hailing_offer",
            resource_id=offer_id,
            version=max(1, int(version)),
            user_ids=[driver_user_id],
            payload={
                "offer_id": offer_id,
                "trip_id": offer.get("trip_id"),
                "driver_id": offer.get("driver_id"),
                "status": offer.get("status"),
                "expires_at": offer.get("expires_at"),
                "updated_at": offer.get("updated_at"),
            },
        )
        if not published:
            logger.warning("hailing_offer_realtime_unavailable offer_id=%s", offer_id)
        return published
    except Exception as exc:
        logger.warning(
            "hailing_offer_realtime_publish_failed offer_id=%s driver_user_id=%s error=%s",
            offer_id,
            driver_user_id,
            type(exc).__name__,
        )
        return False


async def publish_hailing_admin_realtime(trip: Dict[str, Any], event_type: str) -> bool:
    try:
        return await realtime_event_service.publish_admin_event(
            event_type=event_type,
            resource_type="hailing_trip",
            resource_id=str(trip.get("id") or ""),
            version=hailing_realtime_version(trip),
            payload=safe_hailing_trip_payload(trip),
        )
    except Exception as exc:
        logger.warning(
            "hailing_admin_realtime_publish_failed trip_id=%s version=%s error=%s",
            trip.get("id"), hailing_realtime_version(trip), type(exc).__name__,
        )
        return False
