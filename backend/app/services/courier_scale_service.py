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
from app.services.database_scale_service import find_many_bounded, find_one_sorted
from app.services.delivery_security_service import DELIVERY_ARRIVING_RADIUS_METERS, distance_meters, is_inside_radius
from app.services.fulfillment_link_service import sync_food_order_from_delivery
from app.services.routing_service import RoutingError, compute_route
from app.utils import new_id, now_iso


COURIER_HISTORY_LIMIT = 100
COURIER_EVENT_LIMIT = 100
TELEMETRY_MIN_SECONDS = 60
TELEMETRY_FORCE_DISTANCE_METERS = 500.0
TELEMETRY_RETENTION_DAYS = 14


def _parse_recorded_at(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


async def list_user_deliveries_scaled(user: Dict[str, Any]) -> List[Dict[str, Any]]:
    user_id = _user_id(user)
    if user.get("role") == "admin":
        filters: Dict[str, Any] = {}
    elif user.get("role") == "courier":
        filters = {"courier_user_id": user_id}
    else:
        filters = {"sender_user_id": user_id}
    return await find_many_bounded(
        "courier_deliveries",
        filters,
        sort=[("created_at", -1)],
        limit=COURIER_HISTORY_LIMIT,
    )


async def list_delivery_events_scaled(delivery_id: str, user: Dict[str, Any]) -> List[Dict[str, Any]]:
    await get_delivery(delivery_id, user)
    newest_first = await find_many_bounded(
        "courier_events",
        {"delivery_id": delivery_id},
        sort=[("created_at", -1)],
        limit=COURIER_EVENT_LIMIT,
    )
    newest_first.reverse()
    return newest_first


async def _persist_location_snapshot_if_due(snapshot: Dict[str, Any]) -> bool:
    """Retain useful route telemetry without persisting every GPS callback.

    The authoritative latest position remains on courier_deliveries for every accepted
    location update. Historical telemetry is sampled at most once per minute unless
    the courier has moved at least 500m, then automatically expires after 14 days.
    """
    latest = await find_one_sorted(
        "courier_location_snapshots",
        {"delivery_id": snapshot["delivery_id"]},
        sort=[("recorded_at", -1)],
    )
    now = datetime.now(timezone.utc)
    if latest:
        last_at = _parse_recorded_at(latest.get("recorded_at"))
        elapsed = (now - last_at).total_seconds() if last_at else TELEMETRY_MIN_SECONDS
        moved = distance_meters(latest, snapshot)
        if elapsed < TELEMETRY_MIN_SECONDS and (moved is None or moved < TELEMETRY_FORCE_DISTANCE_METERS):
            return False

    retained = {
        **snapshot,
        # TTL indexes require a BSON datetime, not an ISO string.
        "expires_at": now + timedelta(days=TELEMETRY_RETENTION_DAYS),
    }
    await database.insert_one("courier_location_snapshots", retained)
    return True


async def update_courier_location_scaled(
    delivery_id: str,
    location: Dict[str, Any],
    user: Dict[str, Any],
) -> Dict[str, Any]:
    """Authoritative live location with restrained historical telemetry writes."""
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

    snapshot = {
        "id": new_id(),
        "delivery_id": delivery_id,
        "courier_user_id": _user_id(user),
        **location,
        "recorded_at": now_iso(),
    }
    updated = await update_versioned_delivery(
        {"id": delivery_id, "status": delivery.get("status")},
        {
            "last_courier_location": snapshot,
            "live_tracking_active": True,
            "updated_at": now_iso(),
        },
    )
    if not updated:
        current = await database.find_one("courier_deliveries", {"id": delivery_id})
        if current and current.get("status") in FINAL_STATUSES:
            return current
        raise ValueError("Delivery changed while location was updating. Refresh and try again.")

    # Do not make historical telemetry durability part of the critical live-location
    # transaction. The delivery document above is the authoritative current position.
    await _persist_location_snapshot_if_due(snapshot)
    await publish_delivery_realtime(updated, "courier_delivery.location_updated")

    # GPS may arrive every few seconds; road routing is deliberately recomputed at a
    # much slower cadence to protect provider spend and latency.
    last_route_update = updated.get("remaining_route_updated_at")
    should_refresh_route = True
    if isinstance(last_route_update, str):
        try:
            parsed = datetime.fromisoformat(last_route_update.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            should_refresh_route = (datetime.now(timezone.utc) - parsed.astimezone(timezone.utc)).total_seconds() >= 45
        except ValueError:
            should_refresh_route = True
    destination = updated.get("pickup_location") if updated.get("status") in {"ASSIGNED", "COURIER_TO_PICKUP"} else updated.get("dropoff_location")
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
            # Live tracking remains authoritative during a routing provider outage.
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
            await publish_delivery_realtime(arriving, "courier_delivery.status_changed", journey_event=journey_event)
            await _notify_customer_status(arriving, "ARRIVING")
            await sync_food_order_from_delivery(arriving, actor_user_id=_user_id(user))
            return arriving
    return updated
