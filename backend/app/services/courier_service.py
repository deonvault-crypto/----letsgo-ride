from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List

from pymongo.errors import DuplicateKeyError

from app.database import database
from app.config import get_settings
from app.services.delivery_security_service import (
    DELIVERY_ARRIVING_RADIUS_METERS,
    DELIVERY_HANDOFF_RADIUS_METERS,
    create_delivery_handoff,
    distance_meters,
    get_delivery_handoff,
    is_inside_radius,
    verify_delivery_handoff_pin,
)
from app.services.fulfillment_link_service import (
    sync_food_order_from_delivery,
    sync_food_order_pricing,
)
from app.services.courier_state_service import (
    ACTIVE_COURIER_STATUSES,
    TERMINAL_COURIER_STATUSES,
    clear_courier_active_reference,
    set_courier_active_reference,
)
from app.services.notification_service import create_app_notification
from app.services.routing_service import RoutingError, compute_route
from app.utils import new_id, now_iso


FINAL_STATUSES = TERMINAL_COURIER_STATUSES
ACTIVE_TRACKING_STATUSES = ACTIVE_COURIER_STATUSES

ALLOWED_TRANSITIONS = {
    "REQUESTED": {"MATCHING", "ASSIGNED", "COURIER_TO_PICKUP", "CANCELLED"},
    "MATCHING": {"ASSIGNED", "COURIER_TO_PICKUP", "CANCELLED", "FAILED"},
    "ASSIGNED": {"COURIER_TO_PICKUP", "PICKED_UP", "CANCELLED", "FAILED"},
    "COURIER_TO_PICKUP": {"PICKED_UP", "CANCELLED", "FAILED"},
    "PICKED_UP": {"IN_TRANSIT", "FAILED"},
    "IN_TRANSIT": {"ARRIVING", "FAILED"},
    "ARRIVING": {"FAILED"},
    "DELIVERED": set(),
    "CANCELLED": set(),
    "FAILED": set(),
}

CUSTOMER_STATUS_NOTIFICATIONS = {
    "ASSIGNED": ("Courier assigned", "A courier accepted your delivery."),
    "COURIER_TO_PICKUP": ("Courier heading to pickup", "Your courier is on the way to the pickup point."),
    "PICKED_UP": ("Package collected", "Your courier confirmed pickup of the package."),
    "IN_TRANSIT": ("Your package is on the way", "The delivery is now moving toward the recipient."),
    "ARRIVING": ("Courier arriving soon", "The courier is close to the drop-off point."),
    "DELIVERED": ("Delivery complete", "The recipient handoff was confirmed with the 4-digit code."),
    "FAILED": ("Delivery needs attention", "Something interrupted this delivery. Open LetsGoRide for details."),
}


def _user_id(user: Dict[str, Any]) -> str:
    return str(user.get("id") or "")


def _is_admin(user: Dict[str, Any]) -> bool:
    return user.get("role") == "admin"


def _can_view(delivery: Dict[str, Any], user: Dict[str, Any]) -> bool:
    user_id = _user_id(user)
    return bool(
        _is_admin(user)
        or delivery.get("sender_user_id") == user_id
        or delivery.get("courier_user_id") == user_id
    )


def _can_operate_as_courier(delivery: Dict[str, Any], user: Dict[str, Any]) -> bool:
    return _is_admin(user) or (
        user.get("role") == "courier" and delivery.get("courier_user_id") == _user_id(user)
    )


async def _notify_customer_status(delivery: Dict[str, Any], status: str) -> None:
    sender_user_id = str(delivery.get("sender_user_id") or "")
    notification = CUSTOMER_STATUS_NOTIFICATIONS.get(status)
    if not sender_user_id or not notification:
        return
    title, body = notification
    await create_app_notification(
        sender_user_id,
        "courier_update",
        title,
        body,
        {"delivery_id": delivery.get("id"), "courier_status": status},
    )


async def append_delivery_event(
    delivery_id: str,
    event_type: str,
    *,
    actor_user_id: str | None = None,
    data: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    event = {
        "id": new_id(),
        "delivery_id": delivery_id,
        "type": event_type,
        "actor_user_id": actor_user_id,
        "data": data or {},
        "created_at": now_iso(),
    }
    return await database.insert_one("courier_events", event)


async def create_delivery(payload: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    now = now_iso()
    delivery = {
        "id": new_id(),
        "sender_user_id": _user_id(user),
        "sender_name": user.get("name") or "LetsGoRide customer",
        "sender_phone": user.get("phone"),
        "status": "REQUESTED",
        "courier_user_id": None,
        "courier_name": None,
        "quote_status": "PENDING",
        "currency": "USD",
        "price_usd": None,
        "courier_payout_usd": None,
        "distance_km": None,
        "estimated_duration_minutes": None,
        "live_tracking_active": False,
        "last_courier_location": None,
        "source_type": "COURIER_REQUEST",
        "source_id": None,
        "cancelled_at": None,
        "delivered_at": None,
        "created_at": now,
        "updated_at": now,
        **payload,
    }
    saved = await database.insert_one("courier_deliveries", delivery)
    await create_delivery_handoff(saved["id"], _user_id(user))
    await append_delivery_event(
        saved["id"],
        "DELIVERY_REQUESTED",
        actor_user_id=_user_id(user),
        data={"status": saved["status"], "quote_status": saved["quote_status"]},
    )
    return saved


async def get_delivery(delivery_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    delivery = await database.find_one("courier_deliveries", {"id": delivery_id})
    if not delivery:
        raise ValueError("Delivery not found.")
    if not _can_view(delivery, user):
        raise PermissionError("You do not have access to this delivery.")
    return delivery


async def get_delivery_pin(delivery_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    delivery = await get_delivery(delivery_id, user)
    if not (_is_admin(user) or delivery.get("sender_user_id") == _user_id(user)):
        raise PermissionError("Only the customer can view the recipient delivery code.")
    handoff = await get_delivery_handoff(delivery_id)
    if not handoff:
        handoff = await create_delivery_handoff(delivery_id, str(delivery.get("sender_user_id") or ""))
    return {
        "delivery_id": delivery_id,
        "pin": str(handoff.get("pin") or ""),
        "verified": bool(handoff.get("verified_at")),
    }


async def list_user_deliveries(user: Dict[str, Any]) -> List[Dict[str, Any]]:
    user_id = _user_id(user)
    if _is_admin(user):
        deliveries = await database.find_many("courier_deliveries")
    elif user.get("role") == "courier":
        deliveries = await database.find_many("courier_deliveries", {"courier_user_id": user_id})
    else:
        deliveries = await database.find_many("courier_deliveries", {"sender_user_id": user_id})
    return sorted(deliveries, key=lambda item: str(item.get("created_at") or ""), reverse=True)


async def list_delivery_events(delivery_id: str, user: Dict[str, Any]) -> List[Dict[str, Any]]:
    await get_delivery(delivery_id, user)
    events = await database.find_many("courier_events", {"delivery_id": delivery_id})
    return sorted(events, key=lambda item: str(item.get("created_at") or ""))


async def cancel_delivery(
    delivery_id: str,
    user: Dict[str, Any],
    reason: str | None,
) -> Dict[str, Any]:
    delivery = await get_delivery(delivery_id, user)
    if delivery.get("source_type") == "FOOD_ORDER" and not _is_admin(user):
        raise ValueError("Food delivery cancellation must be handled from the food order or support flow.")
    if not (_is_admin(user) or delivery.get("sender_user_id") == _user_id(user)):
        raise PermissionError("Only the sender or an administrator can cancel this delivery.")
    if delivery.get("status") in FINAL_STATUSES:
        raise ValueError("This delivery can no longer be cancelled.")
    if delivery.get("status") in {"PICKED_UP", "IN_TRANSIT", "ARRIVING"} and not _is_admin(user):
        raise ValueError("Contact support to stop a delivery after pickup.")

    stopped_at = now_iso()
    updates = {
        "status": "CANCELLED",
        "cancellation_reason": reason,
        "cancelled_at": stopped_at,
        "live_tracking_active": False,
        "tracking_stopped_at": stopped_at,
        "updated_at": stopped_at,
    }
    updated = await database.update_one("courier_deliveries", delivery_id, updates)
    if not updated:
        raise ValueError("Delivery not found.")
    await append_delivery_event(
        delivery_id,
        "DELIVERY_CANCELLED",
        actor_user_id=_user_id(user),
        data={"reason": reason},
    )
    courier_user_id = str(updated.get("courier_user_id") or "")
    if courier_user_id:
        await create_app_notification(
            courier_user_id,
            "courier_update",
            "Delivery cancelled",
            "LetsGoRide support cancelled this delivery." if _is_admin(user) else "The customer cancelled this job before pickup.",
            {"delivery_id": delivery_id, "courier_status": "CANCELLED"},
        )
    await clear_courier_active_reference(updated)
    await sync_food_order_from_delivery(updated, actor_user_id=_user_id(user))
    sender_user_id = str(updated.get("sender_user_id") or "")
    if sender_user_id and sender_user_id != _user_id(user):
        await create_app_notification(
            sender_user_id,
            "courier_update",
            "Delivery cancelled",
            "LetsGoRide support cancelled this delivery. Open Activity for details.",
            {"delivery_id": delivery_id, "courier_status": "CANCELLED"},
        )
    return updated


async def set_delivery_quote(
    delivery_id: str,
    quote: Dict[str, Any],
    actor: Dict[str, Any],
) -> Dict[str, Any]:
    if not _is_admin(actor):
        raise PermissionError("Only an administrator can set delivery pricing right now.")
    delivery = await database.find_one("courier_deliveries", {"id": delivery_id})
    if not delivery:
        raise ValueError("Delivery not found.")
    if delivery.get("status") in FINAL_STATUSES:
        raise ValueError("A finalised delivery cannot be priced.")

    updates: Dict[str, Any] = {
        "quote_status": "READY",
        "price_usd": round(float(quote["price_usd"]), 2),
        "courier_payout_usd": round(float(quote["courier_payout_usd"]), 2),
        "distance_km": quote.get("distance_km"),
        "estimated_duration_minutes": quote.get("estimated_duration_minutes"),
        "updated_at": now_iso(),
    }
    if delivery.get("status") == "REQUESTED" and not delivery.get("courier_user_id"):
        updates["status"] = "MATCHING"

    updated = await database.update_one("courier_deliveries", delivery_id, updates)
    if not updated:
        raise ValueError("Delivery not found.")
    await append_delivery_event(
        delivery_id,
        "DELIVERY_QUOTED",
        actor_user_id=_user_id(actor),
        data={
            "price_usd": updated.get("price_usd"),
            "courier_payout_usd": updated.get("courier_payout_usd"),
            "distance_km": updated.get("distance_km"),
            "estimated_duration_minutes": updated.get("estimated_duration_minutes"),
        },
    )
    await sync_food_order_pricing(updated, actor_user_id=_user_id(actor))
    return updated


async def assign_delivery(
    delivery_id: str,
    courier_user_id: str,
    actor: Dict[str, Any],
) -> Dict[str, Any]:
    delivery = await database.find_one("courier_deliveries", {"id": delivery_id})
    if not delivery:
        raise ValueError("Delivery not found.")
    if not _is_admin(actor):
        raise PermissionError("Only an administrator can assign courier work directly.")
    if delivery.get("status") in FINAL_STATUSES:
        raise ValueError("A finalised delivery cannot be assigned.")
    if delivery.get("courier_user_id") and delivery.get("courier_user_id") != courier_user_id:
        raise ValueError("This delivery is already assigned to another courier.")

    courier = await database.find_one("users", {"id": courier_user_id})
    if not courier or courier.get("role") != "courier":
        raise ValueError("Courier account not found.")

    now = now_iso()
    try:
        updated = await database.update_one_if(
            "courier_deliveries",
            {
                "id": delivery_id,
                "courier_user_id": delivery.get("courier_user_id"),
                "status": delivery.get("status"),
            },
            {
                "courier_user_id": courier_user_id,
                "courier_name": courier.get("name") or "LetsGoRide Courier",
                "status": "COURIER_TO_PICKUP",
                "live_tracking_active": True,
                "assigned_at": now,
                "updated_at": now,
            },
        )
    except DuplicateKeyError as error:
        raise ValueError("This courier already has an active delivery.") from error
    if not updated:
        raise ValueError("Delivery changed while it was being assigned. Refresh and try again.")
    await append_delivery_event(
        delivery_id,
        "COURIER_ASSIGNED",
        actor_user_id=_user_id(actor),
        data={"courier_user_id": courier_user_id, "assignment_method": "admin"},
    )
    await append_delivery_event(
        delivery_id,
        "STATUS_COURIER_TO_PICKUP",
        actor_user_id=_user_id(actor),
        data={"source": "automatic_after_assignment"},
    )
    await _notify_customer_status(updated, "COURIER_TO_PICKUP")
    await create_app_notification(
        courier_user_id,
        "courier_update",
        "Delivery assigned",
        "Head to the pickup point. Live location starts automatically in the Courier app.",
        {"delivery_id": delivery_id, "courier_status": "COURIER_TO_PICKUP"},
    )
    await set_courier_active_reference(updated)
    await sync_food_order_from_delivery(updated, actor_user_id=_user_id(actor))
    return updated


async def update_delivery_status(
    delivery_id: str,
    status: str,
    user: Dict[str, Any],
    note: str | None = None,
) -> Dict[str, Any]:
    delivery = await get_delivery(delivery_id, user)
    if not _can_operate_as_courier(delivery, user):
        raise PermissionError("Only the assigned courier can update delivery progress.")

    current = str(delivery.get("status") or "")
    if status == current:
        return delivery

    if not _is_admin(user):
        if status != "PICKED_UP" or current not in {"ASSIGNED", "COURIER_TO_PICKUP"}:
            raise ValueError(
                "Courier progress is automatic after acceptance. Only pickup confirmation, delay reporting and recipient PIN handoff require courier input."
            )

        now = now_iso()
        picked_up = await database.update_one_if(
            "courier_deliveries",
            {"id": delivery_id, "status": current},
            {"status": "PICKED_UP", "picked_up_at": now, "updated_at": now},
        )
        if not picked_up:
            raise ValueError("Delivery changed while pickup was being confirmed. Refresh and try again.")
        await append_delivery_event(
            delivery_id,
            "STATUS_PICKED_UP",
            actor_user_id=_user_id(user),
            data={"from": current, "to": "PICKED_UP", "note": note},
        )
        await _notify_customer_status(picked_up, "PICKED_UP")
        await sync_food_order_from_delivery(picked_up, actor_user_id=_user_id(user))

        in_transit = await database.update_one_if(
            "courier_deliveries",
            {"id": delivery_id, "status": "PICKED_UP"},
            {"status": "IN_TRANSIT", "updated_at": now_iso()},
        )
        if not in_transit:
            return picked_up
        await append_delivery_event(
            delivery_id,
            "STATUS_IN_TRANSIT",
            actor_user_id=_user_id(user),
            data={"from": "PICKED_UP", "to": "IN_TRANSIT", "source": "automatic_after_pickup"},
        )
        await _notify_customer_status(in_transit, "IN_TRANSIT")
        await sync_food_order_from_delivery(in_transit, actor_user_id=_user_id(user))
        return in_transit

    if status not in ALLOWED_TRANSITIONS.get(current, set()):
        raise ValueError(f"Delivery cannot move from {current} to {status}.")

    now = now_iso()
    updates: Dict[str, Any] = {"status": status, "updated_at": now}
    if status == "PICKED_UP":
        updates["picked_up_at"] = now
    if status in {"CANCELLED", "FAILED"}:
        updates["live_tracking_active"] = False
        updates["tracking_stopped_at"] = now

    updated = await database.update_one_if(
        "courier_deliveries",
        {"id": delivery_id, "status": current},
        updates,
    )
    if not updated:
        raise ValueError("Delivery changed while progress was being updated. Refresh and try again.")
    await append_delivery_event(
        delivery_id,
        f"STATUS_{status}",
        actor_user_id=_user_id(user),
        data={"from": current, "to": status, "note": note},
    )
    await _notify_customer_status(updated, status)
    await sync_food_order_from_delivery(updated, actor_user_id=_user_id(user))
    if status in FINAL_STATUSES:
        await clear_courier_active_reference(updated)
    return updated


async def report_delivery_delay(
    delivery_id: str,
    user: Dict[str, Any],
    note: str | None,
) -> Dict[str, Any]:
    delivery = await get_delivery(delivery_id, user)
    if not _can_operate_as_courier(delivery, user):
        raise PermissionError("Only the assigned courier can report a delay.")
    if delivery.get("status") not in {"ASSIGNED", "COURIER_TO_PICKUP", "IN_TRANSIT", "ARRIVING"}:
        raise ValueError("A delay cannot be reported for this delivery now.")
    await append_delivery_event(
        delivery_id,
        "COURIER_DELAY_REPORTED",
        actor_user_id=_user_id(user),
        data={"note": note},
    )
    sender_user_id = str(delivery.get("sender_user_id") or "")
    if sender_user_id:
        await create_app_notification(
            sender_user_id,
            "courier_update",
            "Courier reported a delay",
            note or "Your courier reported a short delay. Live tracking remains active.",
            {"delivery_id": delivery_id, "courier_status": delivery.get("status")},
        )
    return delivery


async def complete_delivery_with_pin(
    delivery_id: str,
    pin: str,
    user: Dict[str, Any],
) -> Dict[str, Any]:
    delivery = await get_delivery(delivery_id, user)
    if not _can_operate_as_courier(delivery, user):
        raise PermissionError("Only the assigned courier can complete this delivery.")
    if delivery.get("status") not in {"IN_TRANSIT", "ARRIVING"}:
        raise ValueError("Recipient handoff is only available after pickup.")

    current_location = delivery.get("last_courier_location")
    destination = delivery.get("dropoff_location")
    handoff_distance = distance_meters(current_location, destination)
    if handoff_distance is None:
        raise ValueError("A recent courier GPS location and drop-off pin are required before handoff.")
    if handoff_distance > DELIVERY_HANDOFF_RADIUS_METERS:
        raise ValueError(
            f"Move closer to the recipient before handoff. You must be within {int(DELIVERY_HANDOFF_RADIUS_METERS)} m of the drop-off pin."
        )
    if not await verify_delivery_handoff_pin(delivery_id, pin):
        raise ValueError("That 4-digit delivery code is not correct.")

    now = now_iso()
    updated = await database.update_one_if(
        "courier_deliveries",
        {"id": delivery_id, "status": delivery.get("status")},
        {
            "status": "DELIVERED",
            "delivered_at": now,
            "live_tracking_active": False,
            "tracking_stopped_at": now,
            "delivery_verification_method": "RECIPIENT_PIN",
            "handoff_distance_meters": round(handoff_distance, 1),
            "updated_at": now,
        },
    )
    if not updated:
        raise ValueError("Delivery changed while the handoff was being confirmed. Refresh and try again.")
    await append_delivery_event(
        delivery_id,
        "DELIVERY_CONFIRMED_BY_PIN",
        actor_user_id=_user_id(user),
        data={"handoff_distance_meters": round(handoff_distance, 1)},
    )
    await _notify_customer_status(updated, "DELIVERED")
    await sync_food_order_from_delivery(updated, actor_user_id=_user_id(user))
    await clear_courier_active_reference(updated)
    return updated


async def update_courier_location(
    delivery_id: str,
    location: Dict[str, Any],
    user: Dict[str, Any],
) -> Dict[str, Any]:
    delivery = await get_delivery(delivery_id, user)
    if not _can_operate_as_courier(delivery, user):
        raise PermissionError("Only the assigned courier can share delivery location.")
    if delivery.get("status") not in ACTIVE_TRACKING_STATUSES:
        # Automatic sensor callbacks can arrive just after handoff. Returning
        # repaired server truth tells the client to stop without turning a safe
        # race into a frightening courier-facing error. Legacy/stale tracking
        # flags are cleared here as well; a GPS callback can never resurrect a
        # terminal job.
        if delivery.get("status") in FINAL_STATUSES:
            repaired = await database.update_one_if(
                "courier_deliveries",
                {"id": delivery_id, "status": delivery.get("status")},
                {
                    "live_tracking_active": False,
                    "tracking_stopped_at": delivery.get("tracking_stopped_at") or now_iso(),
                    "updated_at": now_iso(),
                },
            )
            if repaired:
                delivery = repaired
            await clear_courier_active_reference(delivery)
        return delivery

    snapshot = {
        "id": new_id(),
        "delivery_id": delivery_id,
        "courier_user_id": _user_id(user),
        **location,
        "recorded_at": now_iso(),
    }
    updated = await database.update_one_if(
        "courier_deliveries",
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
    await database.insert_one("courier_location_snapshots", snapshot)

    # Refresh the road route at a restrained cadence. GPS can arrive every few
    # seconds; route recomputation is intentionally throttled to protect latency
    # and provider spend while keeping customer/courier remaining ETAs useful.
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
            refreshed = await database.update_one_if(
                "courier_deliveries",
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
        except RoutingError:
            # Location sharing must remain healthy during a routing-provider blip.
            pass

    if updated.get("status") == "IN_TRANSIT" and is_inside_radius(
        snapshot,
        updated.get("dropoff_location"),
        DELIVERY_ARRIVING_RADIUS_METERS,
    ):
        arriving = await database.update_one_if(
            "courier_deliveries",
            {"id": delivery_id, "status": "IN_TRANSIT"},
            {"status": "ARRIVING", "updated_at": now_iso()},
        )
        if arriving:
            await append_delivery_event(
                delivery_id,
                "STATUS_ARRIVING",
                actor_user_id=_user_id(user),
                data={"source": "automatic_geofence", "radius_meters": DELIVERY_ARRIVING_RADIUS_METERS},
            )
            await _notify_customer_status(arriving, "ARRIVING")
            await sync_food_order_from_delivery(arriving, actor_user_id=_user_id(user))
            return arriving
    return updated


async def tracking_state(delivery_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    delivery = await get_delivery(delivery_id, user)
    return {
        "delivery_id": delivery["id"],
        "status": delivery.get("status"),
        "pickup_address": delivery.get("pickup_address"),
        "dropoff_address": delivery.get("dropoff_address"),
        "courier_user_id": delivery.get("courier_user_id"),
        "courier_name": delivery.get("courier_name"),
        "live_tracking_active": bool(delivery.get("live_tracking_active")),
        "last_courier_location": delivery.get("last_courier_location"),
        "estimated_duration_minutes": delivery.get("estimated_duration_minutes"),
        "distance_km": delivery.get("distance_km"),
        "route_polyline": delivery.get("route_polyline"),
        "remaining_distance_km": delivery.get("remaining_distance_km"),
        "remaining_eta_minutes": delivery.get("remaining_eta_minutes"),
        "remaining_route_polyline": delivery.get("remaining_route_polyline"),
        "remaining_route_updated_at": delivery.get("remaining_route_updated_at"),
        "handoff_radius_meters": DELIVERY_HANDOFF_RADIUS_METERS,
    }
