from __future__ import annotations

from typing import Any, Dict

from app.database import database
from app.utils import new_id, now_iso


FOOD_STATUS_RANK = {
    "PLACED": 0,
    "ACCEPTED": 1,
    "PREPARING": 2,
    "READY_FOR_PICKUP": 3,
    "COURIER_ASSIGNED": 4,
    "PICKED_UP": 5,
    "OUT_FOR_DELIVERY": 6,
    "DELIVERED": 7,
}

DELIVERY_TO_FOOD_STATUS = {
    "ASSIGNED": "COURIER_ASSIGNED",
    "COURIER_TO_PICKUP": "COURIER_ASSIGNED",
    "PICKED_UP": "PICKED_UP",
    "IN_TRANSIT": "OUT_FOR_DELIVERY",
    "ARRIVING": "OUT_FOR_DELIVERY",
    "DELIVERED": "DELIVERED",
}


async def _append_food_event(
    order_id: str,
    event_type: str,
    *,
    actor_user_id: str | None = None,
    data: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    return await database.insert_one(
        "food_order_events",
        {
            "id": new_id(),
            "order_id": order_id,
            "type": event_type,
            "actor_user_id": actor_user_id,
            "data": data or {},
            "created_at": now_iso(),
        },
    )


async def _append_delivery_event(
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


async def ensure_food_order_delivery(
    order_id: str,
    *,
    actor_user_id: str | None = None,
) -> Dict[str, Any]:
    """Create exactly one courier fulfillment record once food is ready for pickup."""
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
    }
    saved = await database.insert_one("courier_deliveries", delivery)

    linked_order = await database.update_one_if(
        "food_orders",
        {"id": order_id, "courier_delivery_id": None},
        {"courier_delivery_id": saved["id"], "updated_at": now_iso()},
    )
    if not linked_order:
        current = await database.find_one("food_orders", {"id": order_id})
        winner_id = current.get("courier_delivery_id") if current else None
        if winner_id and winner_id != saved["id"]:
            await database.delete_one("courier_deliveries", saved["id"])
            winner = await database.find_one("courier_deliveries", {"id": winner_id})
            if winner:
                return winner

    await _append_delivery_event(
        saved["id"],
        "FOOD_FULFILLMENT_CREATED",
        actor_user_id=actor_user_id,
        data={"food_order_id": order_id, "quote_status": "PENDING"},
    )
    await _append_food_event(
        order_id,
        "COURIER_FULFILLMENT_CREATED",
        actor_user_id=actor_user_id,
        data={"delivery_id": saved["id"], "quote_status": "PENDING"},
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
    subtotal = float(order.get("subtotal_usd") or 0)
    delivery_fee = round(float(price), 2)
    total = round(subtotal + delivery_fee, 2)
    await database.update_one(
        "food_orders",
        order_id,
        {
            "delivery_fee_usd": delivery_fee,
            "total_usd": total,
            "pricing_status": "READY",
            "updated_at": now_iso(),
        },
    )
    await _append_food_event(
        order_id,
        "DELIVERY_PRICE_READY",
        actor_user_id=actor_user_id,
        data={"delivery_id": delivery.get("id"), "delivery_fee_usd": delivery_fee, "total_usd": total},
    )


async def sync_food_order_from_delivery(
    delivery: Dict[str, Any],
    *,
    actor_user_id: str | None = None,
) -> None:
    order_id = delivery.get("food_order_id")
    target = DELIVERY_TO_FOOD_STATUS.get(str(delivery.get("status") or ""))
    if not order_id or not target:
        return

    order = await database.find_one("food_orders", {"id": order_id})
    if not order:
        return
    current = str(order.get("status") or "")
    if current in {"CANCELLED", "REJECTED", "DELIVERED"}:
        return
    if FOOD_STATUS_RANK.get(target, -1) <= FOOD_STATUS_RANK.get(current, -1):
        return

    updated = await database.update_one(
        "food_orders",
        order_id,
        {"status": target, "updated_at": now_iso()},
    )
    if updated:
        await _append_food_event(
            order_id,
            f"ORDER_{target}",
            actor_user_id=actor_user_id,
            data={"delivery_id": delivery.get("id"), "source": "courier"},
        )
