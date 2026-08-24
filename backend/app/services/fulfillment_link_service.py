from __future__ import annotations

from typing import Any, Dict

from app.database import database
from app.services.delivery_security_service import create_delivery_handoff
from app.services.courier_delivery_realtime_service import (
    append_delivery_journey_event,
    insert_versioned_delivery,
    publish_delivery_realtime,
)
from app.services.notification_service import create_app_notification
from app.services.food_order_realtime_service import (
    append_food_order_event,
    food_order_event_type,
    publish_food_order_realtime,
    update_versioned_food_order,
)
from app.utils import new_id, now_iso


DELIVERY_TO_FULFILLMENT_STATUS = {
    "REQUESTED": "REQUESTED",
    "MATCHING": "MATCHING",
    "ASSIGNED": "COURIER_ASSIGNED",
    "COURIER_TO_PICKUP": "COURIER_TO_PICKUP",
    "PICKED_UP": "PICKED_UP",
    "IN_TRANSIT": "OUT_FOR_DELIVERY",
    "ARRIVING": "ARRIVING",
    "DELIVERED": "DELIVERED",
    "CANCELLED": "CANCELLED",
    "FAILED": "FAILED",
}


async def _append_food_event(
    order_id: str,
    event_type: str,
    *,
    actor_user_id: str | None = None,
    data: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    return await append_food_order_event(
        order_id,
        event_type,
        actor_user_id=actor_user_id,
        data=data,
    )


async def _append_delivery_event(
    delivery_id: str,
    event_type: str,
    *,
    actor_user_id: str | None = None,
    data: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    return await append_delivery_journey_event(
        delivery_id,
        event_type,
        actor_user_id=actor_user_id,
        data=data,
    )


async def ensure_food_order_delivery(
    order_id: str,
    *,
    actor_user_id: str | None = None,
) -> Dict[str, Any]:
    """Create exactly one courier fulfillment record after restaurant acceptance.

    Once accepted, restaurant preparation and courier matching run in parallel. The
    restaurant moves PREPARING -> READY_FOR_PICKUP while dispatch independently
    progresses from matching through pickup, delivery and secure handoff.
    """
    order = await database.find_one("food_orders", {"id": order_id})
    if not order:
        raise ValueError("Food order not found.")

    linked_id = order.get("courier_delivery_id")
    if linked_id:
        linked = await database.find_one("courier_deliveries", {"id": linked_id})
        if linked:
            return linked

    restaurant = await database.find_one("restaurants", {"id": order.get("restaurant_id")})
    if not restaurant:
        raise ValueError("Restaurant not found for this order.")

    delivery_fee = order.get("delivery_fee_usd")
    customer_fee = float(delivery_fee) if isinstance(delivery_fee, (int, float)) else None
    now = now_iso()
    delivery = {
        "id": new_id(),
        "sender_user_id": str(order.get("customer_user_id") or ""),
        "sender_name": order.get("customer_name") or order.get("recipient_name") or "LetsGoRide customer",
        "sender_phone": order.get("recipient_phone"),
        "courier_user_id": None,
        "courier_name": None,
        "status": "REQUESTED",
        "quote_status": "PENDING",
        "currency": order.get("currency") or "USD",
        "price_usd": customer_fee,
        "courier_payout_usd": None,
        "distance_km": None,
        "estimated_duration_minutes": None,
        "live_tracking_active": False,
        "last_courier_location": None,
        "pickup_address": restaurant.get("address") or "Restaurant pickup",
        "dropoff_address": order.get("delivery_address") or "Customer delivery address",
        "pickup_location": restaurant.get("location"),
        "dropoff_location": order.get("delivery_location"),
        "recipient_name": order.get("recipient_name") or order.get("customer_name") or "Customer",
        "recipient_phone": order.get("recipient_phone") or "",
        "package_type": "food",
        "package_description": f"Food order from {restaurant.get('name') or 'restaurant'}",
        "weight_kg": None,
        "declared_value_usd": float(order.get("subtotal_usd") or 0),
        "pickup_note": "Collect the prepared food order from the restaurant.",
        "dropoff_note": order.get("customer_note"),
        "source_type": "FOOD_ORDER",
        "source_id": order_id,
        "food_order_id": order_id,
        "cancelled_at": None,
        "delivered_at": None,
        "created_at": now,
        "updated_at": now,
        "realtime_version": 1,
    }
    saved = await insert_versioned_delivery(delivery)
    await create_delivery_handoff(saved["id"], str(order.get("customer_user_id") or ""))

    linked_order = await update_versioned_food_order(
        {"id": order_id, "courier_delivery_id": None},
        {
            "courier_delivery_id": saved["id"],
            "fulfillment_status": "REQUESTED",
            "updated_at": now_iso(),
        },
    )
    if not linked_order:
        current = await database.find_one("food_orders", {"id": order_id})
        winner_id = current.get("courier_delivery_id") if current else None
        if winner_id and winner_id != saved["id"]:
            await database.delete_one("courier_deliveries", saved["id"])
            handoff = await database.find_one("delivery_handoffs", {"delivery_id": saved["id"]})
            if handoff:
                await database.delete_one("delivery_handoffs", handoff["id"])
            winner = await database.find_one("courier_deliveries", {"id": winner_id})
            if winner:
                return winner

    journey_event = await _append_delivery_event(
        saved["id"],
        "FOOD_FULFILLMENT_CREATED",
        actor_user_id=actor_user_id,
        data={"food_order_id": order_id, "quote_status": "PENDING"},
    )
    await publish_delivery_realtime(saved, "courier_delivery.updated", journey_event=journey_event)
    food_event = await _append_food_event(
        order_id,
        "COURIER_FULFILLMENT_CREATED",
        actor_user_id=actor_user_id,
        data={"delivery_id": saved["id"], "fulfillment_status": "REQUESTED"},
    )
    if linked_order:
        await publish_food_order_realtime(
            linked_order,
            "food_order.fulfillment_updated",
            journey_event=food_event,
        )
    return saved


async def sync_food_order_pricing(
    delivery: Dict[str, Any],
    *,
    actor_user_id: str | None = None,
) -> None:
    order_id = delivery.get("food_order_id")
    price = delivery.get("price_usd")
    if not order_id or not isinstance(price, (int, float)):
        return

    order = await database.find_one("food_orders", {"id": order_id})
    if not order:
        return
    if order.get("status") in {"DELIVERED", "CANCELLED", "REJECTED"}:
        return
    subtotal = float(order.get("subtotal_usd") or 0)
    delivery_fee = round(float(price), 2)
    total = round(subtotal + delivery_fee, 2)
    updates = {
        "delivery_fee_usd": delivery_fee,
        "total_usd": total,
        "pricing_status": "READY",
        "updated_at": now_iso(),
    }
    delivery_status = DELIVERY_TO_FULFILLMENT_STATUS.get(str(delivery.get("status") or ""))
    if delivery_status:
        updates["fulfillment_status"] = delivery_status
    changed = any(order.get(key) != value for key, value in updates.items() if key != "updated_at")
    if not changed:
        return
    filters: Dict[str, Any] = {"id": order_id}
    for key in updates:
        if key != "updated_at":
            filters[key] = order.get(key)
    updated = await update_versioned_food_order(filters, updates)
    if not updated:
        return
    food_event = await _append_food_event(
        order_id,
        "DELIVERY_PRICE_READY",
        actor_user_id=actor_user_id,
        data={"delivery_id": delivery.get("id"), "delivery_fee_usd": delivery_fee, "total_usd": total},
    )
    await publish_food_order_realtime(
        updated,
        "food_order.fulfillment_updated",
        journey_event=food_event,
    )


async def sync_food_order_from_delivery(
    delivery: Dict[str, Any],
    *,
    actor_user_id: str | None = None,
) -> None:
    order_id = delivery.get("food_order_id")
    target = DELIVERY_TO_FULFILLMENT_STATUS.get(str(delivery.get("status") or ""))
    if not order_id or not target:
        return

    order = await database.find_one("food_orders", {"id": order_id})
    if not order:
        return
    if order.get("status") in {"DELIVERED", "CANCELLED", "REJECTED"}:
        return
    if order.get("restaurant_status") in {"REJECTED", "CANCELLED"}:
        return

    if order.get("fulfillment_status") == target:
        return

    updates: Dict[str, Any] = {
        "fulfillment_status": target,
        "updated_at": now_iso(),
    }
    if target == "DELIVERED":
        updates["status"] = "DELIVERED"
        updates["delivered_at"] = delivery.get("delivered_at") or now_iso()
    elif target in {"CANCELLED", "FAILED"}:
        updates["status"] = "CANCELLED"
        updates["cancellation_reason"] = delivery.get("cancellation_reason") or "Delivery closed by LetsGoRide support."
        updates["cancelled_at"] = delivery.get("cancelled_at") or now_iso()

    updated = await update_versioned_food_order(
        {"id": order_id, "fulfillment_status": order.get("fulfillment_status")},
        updates,
    )
    if not updated:
        return

    food_event = await _append_food_event(
        order_id,
        f"FULFILLMENT_{target}",
        actor_user_id=actor_user_id,
        data={"delivery_id": delivery.get("id"), "source": "courier"},
    )
    await publish_food_order_realtime(
        updated,
        food_order_event_type(updated, fulfillment=True),
        journey_event=food_event,
    )

    if target in {"PICKED_UP", "DELIVERED"}:
        restaurant = await database.find_one("restaurants", {"id": order.get("restaurant_id")})
        merchant_user_id = str(restaurant.get("owner_user_id") or "") if restaurant else ""
        if merchant_user_id:
            title = "Order collected" if target == "PICKED_UP" else "Order delivered"
            body = (
                "The courier collected this order from the restaurant."
                if target == "PICKED_UP"
                else "The customer handoff was verified and the order is complete."
            )
            await create_app_notification(
                merchant_user_id,
                "food_update",
                title,
                body,
                {"order_id": order_id, "delivery_id": delivery.get("id")},
            )
