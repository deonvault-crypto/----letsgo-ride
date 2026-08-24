from __future__ import annotations

import logging
from typing import Any, Dict

from app.database import database
from app.models.event import RealtimeAudience
from app.services.event_service import realtime_event_service
from app.utils import new_id, now_iso


logger = logging.getLogger(__name__)
TERMINAL_DELIVERY_STATUSES = {"DELIVERED", "CANCELLED", "FAILED"}


def delivery_realtime_version(delivery: Dict[str, Any]) -> int:
    value = delivery.get("realtime_version", 0)
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else 0


async def insert_versioned_delivery(delivery: Dict[str, Any]) -> Dict[str, Any]:
    item = {**delivery, "realtime_version": 1}
    return await database.insert_one("courier_deliveries", item)


async def update_versioned_delivery(
    filters: Dict[str, Any],
    updates: Dict[str, Any],
) -> Dict[str, Any] | None:
    return await database.update_one_atomic(
        "courier_deliveries",
        filters,
        updates,
        {"realtime_version": 1},
    )


async def append_delivery_journey_event(
    delivery_id: str,
    event_type: str,
    *,
    actor_user_id: str | None = None,
    data: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    return await database.insert_one(
        "courier_events",
        {
            "id": new_id(),
            "delivery_id": delivery_id,
            "type": event_type,
            "actor_user_id": actor_user_id,
            "data": data or {},
            "created_at": now_iso(),
        },
    )


def _audience(delivery: Dict[str, Any]) -> RealtimeAudience:
    user_ids = frozenset(
        item
        for item in (
            str(delivery.get("sender_user_id") or ""),
            str(delivery.get("courier_user_id") or ""),
        )
        if item
    )
    return RealtimeAudience(user_ids=user_ids, roles=frozenset({"admin"}))


def _base_payload(delivery: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "status": delivery.get("status"),
        "realtime_version": delivery_realtime_version(delivery),
        "live_tracking_active": bool(delivery.get("live_tracking_active")),
    }


def _select_payload(delivery: Dict[str, Any], event_type: str) -> Dict[str, Any]:
    payload = _base_payload(delivery)
    if event_type == "courier_delivery.location_updated":
        payload.update(
            {
                "last_courier_location": delivery.get("last_courier_location"),
                "remaining_distance_km": delivery.get("remaining_distance_km"),
                "remaining_eta_minutes": delivery.get("remaining_eta_minutes"),
                "remaining_route_updated_at": delivery.get("remaining_route_updated_at"),
            }
        )
    elif event_type == "courier_delivery.route_updated":
        payload.update(
            {
                "quote_status": delivery.get("quote_status"),
                "price_usd": delivery.get("price_usd"),
                "distance_km": delivery.get("distance_km"),
                "estimated_duration_minutes": delivery.get("estimated_duration_minutes"),
                "route_polyline": delivery.get("route_polyline"),
                "remaining_distance_km": delivery.get("remaining_distance_km"),
                "remaining_eta_minutes": delivery.get("remaining_eta_minutes"),
                "remaining_route_polyline": delivery.get("remaining_route_polyline"),
                "remaining_route_updated_at": delivery.get("remaining_route_updated_at"),
            }
        )
    else:
        payload.update(
            {
                "quote_status": delivery.get("quote_status"),
                "courier_user_id": delivery.get("courier_user_id"),
                "courier_name": delivery.get("courier_name"),
                "price_usd": delivery.get("price_usd"),
                "distance_km": delivery.get("distance_km"),
                "estimated_duration_minutes": delivery.get("estimated_duration_minutes"),
                "route_polyline": delivery.get("route_polyline"),
                "cancelled_at": delivery.get("cancelled_at"),
                "delivered_at": delivery.get("delivered_at"),
            }
        )
    return payload


async def publish_delivery_realtime(
    delivery: Dict[str, Any],
    event_type: str,
    *,
    journey_event: Dict[str, Any] | None = None,
) -> bool:
    """Best-effort publication after committed Mongo truth.

    Realtime availability never changes the success of the REST mutation. Clients
    recover missed events from the authoritative snapshot on reconnect or gaps.
    """
    payload = _select_payload(delivery, event_type)
    if journey_event:
        payload["journey_event"] = {
            "id": journey_event.get("id"),
            "delivery_id": delivery.get("id"),
            "type": journey_event.get("type"),
            "created_at": journey_event.get("created_at"),
        }
    try:
        published = await realtime_event_service.publish(
            realtime_event_service.build_event(
                event_type=event_type,
                resource_type="courier_delivery",
                resource_id=str(delivery.get("id") or ""),
                version=delivery_realtime_version(delivery),
                audience=_audience(delivery),
                payload=payload,
            )
        )
        if not published:
            logger.warning(
                "courier_delivery_realtime_unavailable delivery_id=%s version=%s",
                delivery.get("id"),
                delivery_realtime_version(delivery),
            )
        return published
    except Exception as exc:
        logger.warning(
            "courier_delivery_realtime_publish_failed delivery_id=%s version=%s error=%s",
            delivery.get("id"),
            delivery_realtime_version(delivery),
            type(exc).__name__,
        )
        return False


def delivery_event_type(delivery: Dict[str, Any], *, location: bool = False, route: bool = False) -> str:
    if str(delivery.get("status") or "") in TERMINAL_DELIVERY_STATUSES:
        return "courier_delivery.terminal"
    if route:
        return "courier_delivery.route_updated"
    if location:
        return "courier_delivery.location_updated"
    return "courier_delivery.status_changed"
