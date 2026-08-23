from __future__ import annotations

from typing import Any, Dict, List

from app.database import database
from app.services.fulfillment_link_service import (
    sync_food_order_from_delivery,
    sync_food_order_pricing,
)
from app.services.notification_service import create_app_notification
from app.utils import new_id, now_iso


FINAL_STATUSES = {"DELIVERED", "CANCELLED", "FAILED"}
ACTIVE_TRACKING_STATUSES = {
    "ASSIGNED",
    "COURIER_TO_PICKUP",
    "PICKED_UP",
    "IN_TRANSIT",
    "ARRIVING",
}

ALLOWED_TRANSITIONS = {
    "REQUESTED": {"MATCHING", "ASSIGNED", "CANCELLED"},
    "MATCHING": {"ASSIGNED", "CANCELLED", "FAILED"},
    "ASSIGNED": {"COURIER_TO_PICKUP", "CANCELLED", "FAILED"},
    "COURIER_TO_PICKUP": {"PICKED_UP", "CANCELLED", "FAILED"},
    "PICKED_UP": {"IN_TRANSIT", "FAILED"},
    "IN_TRANSIT": {"ARRIVING", "DELIVERED", "FAILED"},
    "ARRIVING": {"DELIVERED", "FAILED"},
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
    "DELIVERED": ("Delivery complete", "Your package was marked as delivered."),
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
    return _is_admin(user) or delivery.get("courier_user_id") == _user_id(user)


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
    if delivery.get("source_type") == "FOOD_ORDER":
        raise ValueError("Food delivery cancellation must be handled from the food order or support flow.")
    if not (_is_admin(user) or delivery.get("sender_user_id") == _user_id(user)):
        raise PermissionError("Only the sender or an administrator can cancel this delivery.")
    if delivery.get("status") in FINAL_STATUSES:
        raise ValueError("This delivery can no longer be cancelled.")
    if delivery.get("status") in {"PICKED_UP", "IN_TRANSIT", "ARRIVING"}:
        raise ValueError("Contact support to stop a delivery after pickup.")

    updates = {
        "status": "CANCELLED",
        "cancellation_reason": reason,
        "cancelled_at": now_iso(),
        "live_tracking_active": False,
        "updated_at": now_iso(),
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
            "The customer cancelled this job before pickup.",
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
            "status": "ASSIGNED",
            "live_tracking_active": True,
            "assigned_at": now,
            "updated_at": now,
        },
    )
    if not updated:
        raise ValueError("Delivery changed while it was being assigned. Refresh and try again.")
    await append_delivery_event(
        delivery_id,
        "COURIER_ASSIGNED",
        actor_user_id=_user_id(actor),
        data={"courier_user_id": courier_user_id, "assignment_method": "admin"},
    )
    await _notify_customer_status(updated, "ASSIGNED")
    await create_app_notification(
        courier_user_id,
        "courier_update",
        "Delivery assigned",
        "A delivery has been assigned to your Courier account.",
        {"delivery_id": delivery_id, "courier_status": "ASSIGNED"},
    )
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
    if status not in ALLOWED_TRANSITIONS.get(current, set()):
        raise ValueError(f"Delivery cannot move from {current} to {status}.")

    now = now_iso()
    updates: Dict[str, Any] = {"status": status, "updated_at": now}
    if status == "PICKED_UP":
        updates["picked_up_at"] = now
    if status == "DELIVERED":
        updates["delivered_at"] = now
        updates["live_tracking_active"] = False
    if status in {"CANCELLED", "FAILED"}:
        updates["live_tracking_active"] = False

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
        raise ValueError("Live location is not active for this delivery.")

    snapshot = {
        "id": new_id(),
        "delivery_id": delivery_id,
        "courier_user_id": _user_id(user),
        **location,
        "recorded_at": now_iso(),
    }
    await database.insert_one("courier_location_snapshots", snapshot)
    updated = await database.update_one(
        "courier_deliveries",
        delivery_id,
        {
            "last_courier_location": snapshot,
            "live_tracking_active": True,
            "updated_at": now_iso(),
        },
    )
    if not updated:
        raise ValueError("Delivery not found.")
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
    }
