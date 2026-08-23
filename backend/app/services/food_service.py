from __future__ import annotations

from typing import Any, Dict, List

from app.database import database
from app.services.notification_service import create_app_notification
from app.utils import new_id, now_iso


FINAL_ORDER_STATUSES = {"DELIVERED", "CANCELLED", "REJECTED"}
CUSTOMER_CANCELLABLE_RESTAURANT_STATUSES = {"PLACED", "ACCEPTED"}
PRE_PICKUP_DELIVERY_STATUSES = {"REQUESTED", "MATCHING", "ASSIGNED", "COURIER_TO_PICKUP"}


async def list_restaurants() -> List[Dict[str, Any]]:
    restaurants = await database.find_many("restaurants")
    public = [item for item in restaurants if item.get("status") == "ACTIVE"]
    return sorted(public, key=lambda item: str(item.get("name") or "").lower())


async def get_restaurant(restaurant_id: str) -> Dict[str, Any]:
    restaurant = await database.find_one("restaurants", {"id": restaurant_id})
    if not restaurant or restaurant.get("status") != "ACTIVE":
        raise ValueError("Restaurant not found.")
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
    event = {
        "id": new_id(),
        "order_id": order_id,
        "type": event_type,
        "actor_user_id": actor_user_id,
        "data": data or {},
        "created_at": now_iso(),
    }
    return await database.insert_one("food_order_events", event)


async def create_food_order(payload: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    restaurant = await get_restaurant(payload["restaurant_id"])
    if not restaurant.get("is_accepting_orders", True):
        raise ValueError("This restaurant is not accepting orders right now.")

    requested_items = payload.get("items") or []
    if not requested_items:
        raise ValueError("Add at least one menu item.")

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
        # status remains the simple customer-facing summary. Operational state is
        # split below so restaurant preparation and courier movement can overlap.
        "status": "PLACED",
        "restaurant_status": "PLACED",
        "fulfillment_status": "NOT_STARTED",
        # A real payment provider has not been wired yet. Keeping this explicit
        # prevents staging/demo checkout from being mistaken for a real charge.
        "payment_status": "NOT_CONFIGURED",
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
    saved = await database.insert_one("food_orders", order)
    await append_order_event(
        saved["id"],
        "ORDER_PLACED",
        actor_user_id=str(user.get("id") or ""),
        data={"restaurant_id": restaurant["id"], "subtotal_usd": saved["subtotal_usd"]},
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
    updated = await database.update_one(
        "food_orders",
        order_id,
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
        await database.update_one(
            "courier_deliveries",
            delivery_id,
            {
                "status": "CANCELLED",
                "cancellation_reason": reason,
                "cancelled_at": now,
                "live_tracking_active": False,
                "updated_at": now,
            },
        )
        await database.insert_one(
            "courier_events",
            {
                "id": new_id(),
                "delivery_id": delivery_id,
                "type": "DELIVERY_CANCELLED_FROM_FOOD_ORDER",
                "actor_user_id": str(user.get("id") or ""),
                "data": {"reason": reason},
                "created_at": now_iso(),
            },
        )
        courier_user_id = str(linked_delivery.get("courier_user_id") or "")
        if courier_user_id:
            await create_app_notification(
                courier_user_id,
                "food_update",
                "Food delivery cancelled",
                "The customer cancelled this order before pickup.",
                {"order_id": order_id, "delivery_id": delivery_id},
            )

    await append_order_event(
        order_id,
        "ORDER_CANCELLED",
        actor_user_id=str(user.get("id") or ""),
        data={"reason": reason},
    )
    return updated
