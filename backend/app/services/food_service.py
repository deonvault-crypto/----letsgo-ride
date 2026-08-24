from __future__ import annotations

from typing import Any, Dict, List

from app.database import database
from app.services.notification_service import create_app_notification
from app.services.courier_state_service import clear_courier_active_reference
from app.services.courier_delivery_realtime_service import (
    append_delivery_journey_event,
    publish_delivery_realtime,
    update_versioned_delivery,
)
from app.services.courier_offer_realtime_service import publish_courier_offer_transition
from app.services.food_order_realtime_service import (
    append_food_order_event,
    insert_versioned_food_order,
    publish_food_order_realtime,
    update_versioned_food_order,
)
from app.utils import new_id, now_iso


FINAL_ORDER_STATUSES = {"DELIVERED", "CANCELLED", "REJECTED"}
CUSTOMER_CANCELLABLE_RESTAURANT_STATUSES = {"PENDING_RESTAURANT", "PREPARING"}
PRE_PICKUP_DELIVERY_STATUSES = {"REQUESTED", "MATCHING", "ASSIGNED", "COURIER_TO_PICKUP"}
PUBLIC_RESTAURANT_STATUSES = {"ACTIVE", "COMING_SOON"}


async def list_restaurants() -> List[Dict[str, Any]]:
    restaurants = await database.find_many("restaurants")
    public = [item for item in restaurants if item.get("status") in PUBLIC_RESTAURANT_STATUSES]
    for item in public:
        item["is_orderable"] = bool(item.get("status") == "ACTIVE" and item.get("is_accepting_orders", True))
    return sorted(
        public,
        key=lambda item: (
            0 if item.get("status") == "ACTIVE" else 1,
            str(item.get("name") or "").lower(),
        ),
    )


async def get_restaurant(restaurant_id: str) -> Dict[str, Any]:
    restaurant = await database.find_one("restaurants", {"id": restaurant_id})
    if not restaurant or restaurant.get("status") != "ACTIVE":
        raise ValueError("Restaurant not found or not yet available for ordering.")
    return restaurant


async def get_restaurant_menu(restaurant_id: str) -> Dict[str, Any]:
    restaurant = await get_restaurant(restaurant_id)
    categories = await database.find_many("menu_categories", {"restaurant_id": restaurant_id})
    items = await database.find_many("menu_items", {"restaurant_id": restaurant_id})
    categories = sorted(categories, key=lambda item: int(item.get("sort_order") or 0))
    active_items = [item for item in items if item.get("is_available", True)]
    return {
        "restaurant": restaurant,
        "categories": categories,
        "items": active_items,
    }


async def append_order_event(
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


async def create_food_order(payload: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    restaurant = await get_restaurant(payload["restaurant_id"])
    if not restaurant.get("is_accepting_orders", True):
        raise ValueError("This restaurant is closed for orders right now.")

    requested_items = payload.get("items") or []
    if not requested_items:
        raise ValueError("Add at least one menu item.")

    delivery_location = payload.get("delivery_location")
    if not isinstance(delivery_location, dict):
        raise ValueError("Choose a precise delivery location on the map before checkout.")

    payment_method = str(payload.get("payment_method") or "CASH_ON_DELIVERY")
    if payment_method != "CASH_ON_DELIVERY":
        raise ValueError("That payment method is not available yet.")

    item_snapshots: List[Dict[str, Any]] = []
    subtotal = 0.0
    for requested in requested_items:
        menu_item = await database.find_one("menu_items", {"id": requested["menu_item_id"]})
        if not menu_item or menu_item.get("restaurant_id") != restaurant["id"]:
            raise ValueError("One or more menu items are no longer available.")
        if not menu_item.get("is_available", True):
            raise ValueError(f"{menu_item.get('name') or 'A menu item'} is currently unavailable.")

        quantity = int(requested["quantity"])
        unit_price = float(menu_item.get("price_usd") or 0)
        line_total = round(unit_price * quantity, 2)
        subtotal += line_total
        item_snapshots.append(
            {
                "menu_item_id": menu_item["id"],
                "name": menu_item.get("name"),
                "quantity": quantity,
                "unit_price_usd": unit_price,
                "line_total_usd": line_total,
                "note": requested.get("note"),
            }
        )

    now = now_iso()
    order = {
        "id": new_id(),
        "customer_user_id": str(user.get("id") or ""),
        "customer_name": user.get("name") or payload.get("recipient_name"),
        "restaurant_id": restaurant["id"],
        "restaurant_name": restaurant.get("name"),
        "status": "PENDING_RESTAURANT",
        "restaurant_status": "PENDING_RESTAURANT",
        "fulfillment_status": "NOT_STARTED",
        "payment_method": payment_method,
        "payment_status": "PAY_ON_DELIVERY",
        "items": item_snapshots,
        "subtotal_usd": round(subtotal, 2),
        "delivery_fee_usd": None,
        "total_usd": None,
        "pricing_status": "DELIVERY_FEE_PENDING",
        "currency": "USD",
        "courier_delivery_id": None,
        "created_at": now,
        "updated_at": now,
        **{key: value for key, value in payload.items() if key != "items"},
    }
    saved = await insert_versioned_food_order(order)
    customer_id = str(user.get("id") or "")

    journey_event = await append_order_event(
        saved["id"],
        "ORDER_PLACED",
        actor_user_id=customer_id,
        data={
            "restaurant_id": restaurant["id"],
            "subtotal_usd": saved["subtotal_usd"],
            "payment_method": payment_method,
            "restaurant_status": "PENDING_RESTAURANT",
        },
    )
    await publish_food_order_realtime(saved, "food_order.created", journey_event=journey_event)

    merchant_user_id = str(restaurant.get("owner_user_id") or "")
    if merchant_user_id:
        await create_app_notification(
            merchant_user_id,
            "food_update",
            "New order needs a response",
            f"Review and accept the new {restaurant.get('name') or 'restaurant'} order.",
            {
                "food_order_id": saved["id"],
                "restaurant_id": restaurant["id"],
                "notification_target": "merchant_order",
            },
        )

    await create_app_notification(
        customer_id,
        "food_update",
        "Order sent",
        f"{restaurant.get('name') or 'The restaurant'} is reviewing your order. We will update you when it is accepted.",
        {
            "food_order_id": saved["id"],
            "restaurant_id": restaurant["id"],
            "notification_target": "customer_food_order",
        },
    )

    return saved


async def list_customer_orders(user: Dict[str, Any]) -> List[Dict[str, Any]]:
    orders = await database.find_many("food_orders", {"customer_user_id": str(user.get("id") or "")})
    return sorted(orders, key=lambda item: str(item.get("created_at") or ""), reverse=True)


async def get_customer_order(order_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    order = await database.find_one("food_orders", {"id": order_id})
    if not order:
        raise ValueError("Order not found.")
    if user.get("role") != "admin" and order.get("customer_user_id") != str(user.get("id") or ""):
        raise PermissionError("You do not have access to this order.")
    return order


async def list_order_events(order_id: str, user: Dict[str, Any]) -> List[Dict[str, Any]]:
    await get_customer_order(order_id, user)
    events = await database.find_many("food_order_events", {"order_id": order_id})
    return sorted(events, key=lambda item: str(item.get("created_at") or ""))


async def cancel_food_order(order_id: str, user: Dict[str, Any], reason: str | None) -> Dict[str, Any]:
    order = await get_customer_order(order_id, user)
    restaurant_status = str(order.get("restaurant_status") or order.get("status") or "")
    if restaurant_status not in CUSTOMER_CANCELLABLE_RESTAURANT_STATUSES:
        raise ValueError("This order can no longer be cancelled in the app.")

    linked_delivery = None
    delivery_id = str(order.get("courier_delivery_id") or "")
    if delivery_id:
        linked_delivery = await database.find_one("courier_deliveries", {"id": delivery_id})
        if linked_delivery and linked_delivery.get("status") not in PRE_PICKUP_DELIVERY_STATUSES:
            raise ValueError("The courier has already collected this order. Contact support for help.")

    now = now_iso()
    updated = await update_versioned_food_order(
        {"id": order_id, "restaurant_status": order.get("restaurant_status")},
        {
            "status": "CANCELLED",
            "restaurant_status": "CANCELLED",
            "fulfillment_status": "CANCELLED",
            "cancellation_reason": reason,
            "cancelled_at": now,
            "updated_at": now,
        },
    )
    if not updated:
        raise ValueError("Order not found.")

    if linked_delivery:
        terminal_delivery = await update_versioned_delivery(
            {"id": delivery_id, "status": linked_delivery.get("status")},
            {
                "status": "CANCELLED",
                "cancellation_reason": reason,
                "cancelled_at": now,
                "live_tracking_active": False,
                "tracking_stopped_at": now,
                "updated_at": now,
            },
        )
        if not terminal_delivery:
            raise ValueError("Delivery changed while the order was being cancelled. Refresh and try again.")
        await clear_courier_active_reference(terminal_delivery)
        journey_event = await append_delivery_journey_event(
            delivery_id,
            "DELIVERY_CANCELLED_FROM_FOOD_ORDER",
            actor_user_id=str(user.get("id") or ""),
            data={"reason": reason},
        )
        await publish_delivery_realtime(terminal_delivery, "courier_delivery.terminal", journey_event=journey_event)
        await publish_courier_offer_transition(linked_delivery, terminal_delivery)
        courier_user_id = str(linked_delivery.get("courier_user_id") or "")
        if courier_user_id:
            await create_app_notification(
                courier_user_id,
                "food_update",
                "Food delivery cancelled",
                "The customer cancelled this order before pickup.",
                {
                    "food_order_id": order_id,
                    "delivery_id": delivery_id,
                    "notification_target": "courier_delivery",
                },
            )

    merchant_user_id = ""
    restaurant = await database.find_one("restaurants", {"id": order.get("restaurant_id")})
    if restaurant:
        merchant_user_id = str(restaurant.get("owner_user_id") or "")
    if merchant_user_id:
        await create_app_notification(
            merchant_user_id,
            "food_update",
            "Order cancelled",
            "The customer cancelled this order before courier pickup.",
            {
                "food_order_id": order_id,
                "restaurant_id": order.get("restaurant_id"),
                "notification_target": "merchant_order",
            },
        )

    journey_event = await append_order_event(
        order_id,
        "ORDER_CANCELLED",
        actor_user_id=str(user.get("id") or ""),
        data={"reason": reason},
    )
    await publish_food_order_realtime(updated, "food_order.terminal", journey_event=journey_event)
    return updated
