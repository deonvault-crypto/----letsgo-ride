from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from app.config import get_settings
from app.database import database
from app.services.courier_delivery_realtime_service import publish_delivery_realtime, update_versioned_delivery
from app.services.courier_service import (
    ACTIVE_TRACKING_STATUSES,
    FINAL_STATUSES,
    _can_operate_as_courier,
    _notify_customer_status,
    _user_id,
    append_delivery_event,
    get_delivery,
)
from app.services.courier_state_service import clear_courier_active_reference
from app.services.delivery_security_service import DELIVERY_ARRIVING_RADIUS_METERS, distance_meters, is_inside_radius
from app.services.fulfillment_link_service import sync_food_order_from_delivery
from app.services.routing_service import RoutingError, compute_route
from app.utils import new_id, now_iso


COURIER_HISTORY_LIMIT = 100
COURIER_EVENT_LIMIT = 100
TELEMETRY_MIN_SECONDS = 60
TELEMETRY_FORCE_DISTANCE_METERS = 500.0
TELEMETRY_RETENTION_DAYS = 14


def _parse_utc(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _telemetry_due(delivery: Dict[str, Any], snapshot: Dict[str, Any], now: datetime) -> bool:
    last_at = _parse_utc(delivery.get("telemetry_last_persisted_at"))
    if last_at is None:
        return True
    if (now - last_at).total_seconds() >= TELEMETRY_MIN_SECONDS:
        return True
    last_lat = delivery.get("telemetry_last_latitude")
    last_lon = delivery.get("telemetry_last_longitude")
    if last_lat is None or last_lon is None:
        return True
    moved = distance_meters(
        {"latitude": last_lat, "longitude": last_lon},
        snapshot,
    )
    return moved is not None and moved >= TELEMETRY_FORCE_DISTANCE_METERS


async def list_user_deliveries_scaled(user: Dict[str, Any]) -> List[Dict[str, Any]]:
    user_id = _user_id(user)
    if user.get("role") == "admin":
        filters: Dict[str, Any] = {}
    elif user.get("role") == "courier":
        filters = {"courier_user_id": user_id}
    else:
        filters = {"sender_user_id": user_id}
    return await database.find_many(
        "courier_deliveries",
        filters,
        sort=[("created_at", -1)],
        limit=COURIER_HISTORY_LIMIT,
    )


async def list_delivery_events_scaled(delivery_id: str, user: Dict[str, Any]) -> List[Dict[str, Any]]:
    await get_delivery(delivery_id, user)
    # Fetch the newest tail efficiently, then restore chronological presentation.
    events = await database.find_many(
        "courier_events",
        {"delivery_id": delivery_id},
        sort=[("created_at", -1)],
        limit=COURIER_EVENT_LIMIT,
    )
    events.reverse()
    return events


async def update_courier_location_scaled(
    delivery_id: str,
    location: Dict[str, Any],
    user: Dict[str, Any],
) -> Dict[str, Any]:
    """Update authoritative live position while retaining only useful GPS telemetry."""
    delivery = await get_delivery(delivery_id, user)
    if not _can_operate_as_courier(delivery, user):
        raise PermissionError("Only the assigned courier can share delivery location.")
    if delivery.get("status") not in ACTIVE_TRACKING_STATUSES:
        if delivery.get("status") in FINAL_STATUSES:
            if delivery.get("live_tracking_active") or not delivery.get("tracking_stopped_at"):
                repaired = await update_versioned_delivery(
                    {"id": delivery_id, "status": delivery.get("status")},
                    {
                        "live_tracking_active": False,
                        "tracking_stopped_at": delivery.get("tracking_stopped_at") or now_iso(),
                        "updated_at": now_iso(),
                    },
                )
                if repaired:
                    delivery = repaired
                    await publish_delivery_realtime(delivery, "courier_delivery.terminal")
            await clear_courier_active_reference(delivery)
        return delivery

    now = datetime.now(timezone.utc)
    recorded_at = now.isoformat()
    snapshot = {
        "id": new_id(),
        "delivery_id": delivery_id,
        "courier_user_id": _user_id(user),
        **location,
        "recorded_at": recorded_at,
    }
    retain_telemetry = _telemetry_due(delivery, snapshot, now)
    delivery_updates: Dict[str, Any] = {
        "last_courier_location": snapshot,
        "live_tracking_active": True,
        "updated_at": recorded_at,
    }
    if retain_telemetry:
        delivery_updates.update(
            {
                "telemetry_last_persisted_at": recorded_at,
                "telemetry_last_latitude": snapshot.get("latitude"),
                "telemetry_last_longitude": snapshot.get("longitude"),
            }
        )

    updated = await update_versioned_delivery(
        {"id": delivery_id, "status": delivery.get("status")},
        delivery_updates,
    )
    if not updated:
        current = await database.find_one("courier_deliveries", {"id": delivery_id})
        if current and current.get("status") in FINAL_STATUSES:
            return current
        raise ValueError("Delivery changed while location was updating. Refresh and try again.")

    if retain_telemetry:
        # Only this high-frequency telemetry collection expires. The delivery,
        # recipient handoff/POD, earnings and audit trail remain durable.
        await database.insert_one(
            "courier_location_snapshots",
            {
                **snapshot,
                "expires_at": now + timedelta(days=TELEMETRY_RETENTION_DAYS),
            },
        )

    await publish_delivery_realtime(updated, "courier_delivery.location_updated")

    # GPS may arrive every few seconds; road routing is deliberately recomputed at
    # a slower cadence so a provider outage or quota spike cannot dominate tracking.
    last_route_update = updated.get("remaining_route_updated_at")
    should_refresh_route = True
    if isinstance(last_route_update, str):
        parsed = _parse_utc(last_route_update)
        if parsed is not None:
            should_refresh_route = (now - parsed).total_seconds() >= 45
    destination = (
        updated.get("pickup_location")
        if updated.get("status") in {"ASSIGNED", "COURIER_TO_PICKUP"}
        else updated.get("dropoff_location")
    )
    if should_refresh_route and get_settings().routing_configured and isinstance(destination, dict):
        try:
            remaining = await compute_route(snapshot, destination, include_polyline=True)
            refreshed = await update_versioned_delivery(
                {"id": delivery_id, "status": updated.get("status")},
                {
                    "remaining_distance_km": remaining.get("distance_km"),
                    "remaining_eta_minutes": remaining.get("estimated_duration_minutes"),
                    "remaining_route_polyline": remaining.get("encoded_polyline"),
                    "remaining_route_updated_at": now_iso(),
                },
            )
            if refreshed:
                updated = refreshed
                await publish_delivery_realtime(updated, "courier_delivery.route_updated")
        except RoutingError:
            # The current GPS state remains authoritative if routing is degraded.
            pass

    if updated.get("status") == "IN_TRANSIT" and is_inside_radius(
        snapshot,
        updated.get("dropoff_location"),
        DELIVERY_ARRIVING_RADIUS_METERS,
    ):
        arriving = await update_versioned_delivery(
            {"id": delivery_id, "status": "IN_TRANSIT"},
            {"status": "ARRIVING", "updated_at": now_iso()},
        )
        if arriving:
            journey_event = await append_delivery_event(
                delivery_id,
                "STATUS_ARRIVING",
                actor_user_id=_user_id(user),
                data={"source": "automatic_geofence", "radius_meters": DELIVERY_ARRIVING_RADIUS_METERS},
            )
            await publish_delivery_realtime(
                arriving,
                "courier_delivery.status_changed",
                journey_event=journey_event,
            )
            await _notify_customer_status(arriving, "ARRIVING")
            await sync_food_order_from_delivery(arriving, actor_user_id=_user_id(user))
            return arriving
    return updated
