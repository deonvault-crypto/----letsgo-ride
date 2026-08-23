from __future__ import annotations

from typing import Any, Dict, List

from app.database import database
from app.services.delivery_quote_service import maybe_auto_quote_delivery
from app.services.food_service import append_order_event
from app.services.fulfillment_link_service import ensure_food_order_delivery
from app.utils import new_id, now_iso


MERCHANT_ORDER_TRANSITIONS = {
    "PLACED": {"ACCEPTED", "PREPARING", "REJECTED"},
    "ACCEPTED": {"PREPARING"},
    "PREPARING": {"READY_FOR_PICKUP"},
}


def _user_id(user: Dict[str, Any]) -> str:
    return str(user.get("id") or "")


def _is_admin(user: Dict[str, Any]) -> bool:
    return user.get("role") == "admin"


async def require_restaurant_access(restaurant_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    restaurant = await database.find_one("restaurants", {"id": restaurant_id})
    if not restaurant:
        raise ValueError("Restaurant not found.")
    if not _is_admin(user) and restaurant.get("owner_user_id") != _user_id(user):
        raise PermissionError("You do not have access to this restaurant.")
    return restaurant


async def create_restaurant(payload: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    now = now_iso()
    restaurant = {
        "id": new_id(),
        "owner_user_id": _user_id(user),
        "status": "DRAFT",
        "is_accepting_orders": False,
        "rating": None,
        "review_count": 0,
        "hero_image_url": None,
        "logo_url": None,
        "created_at": now,
        "updated_at": now,
        **payload,
    }
    return await database.insert_one("restaurants", restaurant)


async def list_my_restaurants(user: Dict[str, Any]) -> List[Dict[str, Any]]:
    if _is_admin(user):
        restaurants = await database.find_many("restaurants")
    else:
        restaurants = await database.find_many("restaurants", {"owner_user_id": _user_id(user)})
    return sorted(restaurants, key=lambda item: str(item.get("created_at") or ""), reverse=True)


async def update_restaurant(
    restaurant_id: str,
    updates: Dict[str, Any],
    user: Dict[str, Any],
) -> Dict[str, Any]:
    await require_restaurant_access(restaurant_id, user)
    clean = {key: value for key, value in updates.items() if value is not None}
    clean["updated_at"] = now_iso()
    updated = await database.update_one("restaurants", restaurant_id, clean)
    if not updated:
        raise ValueError("Restaurant not found.")
    return updated


async def submit_restaurant_for_review(restaurant_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    restaurant = await require_restaurant_access(restaurant_id, user)
    categories = await database.find_many("menu_categories", {"restaurant_id": restaurant_id})
    items = await database.find_many("menu_items", {"restaurant_id": restaurant_id})
    if not str(restaurant.get("address") or "").strip():
        raise ValueError("Add a restaurant address before submitting for review.")
    if not categories or not items:
        raise ValueError("Add at least one menu category and item before submitting for review.")
    updated = await database.update_one(
        "restaurants",
        restaurant_id,
        {
            "status": "PENDING_REVIEW",
            "is_accepting_orders": False,
            "submitted_at": now_iso(),
            "updated_at": now_iso(),
        },
    )
    if not updated:
        raise ValueError("Restaurant not found.")
    return updated


async def activate_restaurant(restaurant_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    if not _is_admin(user):
        raise PermissionError("Only an administrator can activate a restaurant.")
    restaurant = await database.find_one("restaurants", {"id": restaurant_id})
    if not restaurant:
        raise ValueError("Restaurant not found.")
    if restaurant.get("status") not in {"PENDING_REVIEW", "ACTIVE"}:
        raise ValueError("Restaurant must be submitted for review before activation.")
    updated = await database.update_one(
        "restaurants",
        restaurant_id,
        {
            "status": "ACTIVE",
            "is_accepting_orders": True,
            "activated_at": now_iso(),
            "updated_at": now_iso(),
        },
    )
    if not updated:
        raise ValueError("Restaurant not found.")
    return updated


async def create_menu_category(
    restaurant_id: str,
    payload: Dict[str, Any],
    user: Dict[str, Any],
) -> Dict[str, Any]:
    await require_restaurant_access(restaurant_id, user)
    category = {
        "id": new_id(),
        "restaurant_id": restaurant_id,
        "created_at": now_iso(),
        "updated_at": now_iso(),
        **payload,
    }
    return await database.insert_one("menu_categories", category)


async def create_menu_item(
    restaurant_id: str,
    payload: Dict[str, Any],
    user: Dict[str, Any],
) -> Dict[str, Any]:
    await require_restaurant_access(restaurant_id, user)
    category = await database.find_one("menu_categories", {"id": payload["category_id"]})
    if not category or category.get("restaurant_id") != restaurant_id:
        raise ValueError("Menu category not found for this restaurant.")
    item = {
        "id": new_id(),
        "restaurant_id": restaurant_id,
        "created_at": now_iso(),
        "updated_at": now_iso(),
        **payload,
    }
    return await database.insert_one("menu_items", item)


async def update_menu_item(
    item_id: str,
    payload: Dict[str, Any],
    user: Dict[str, Any],
) -> Dict[str, Any]:
    item = await database.find_one("menu_items", {"id": item_id})
    if not item:
        raise ValueError("Menu item not found.")
    await require_restaurant_access(item["restaurant_id"], user)
    clean = {key: value for key, value in payload.items() if value is not None}
    if clean.get("category_id"):
        category = await database.find_one("menu_categories", {"id": clean["category_id"]})
        if not category or category.get("restaurant_id") != item["restaurant_id"]:
            raise ValueError("Menu category not found for this restaurant.")
    clean["updated_at"] = now_iso()
    updated = await database.update_one("menu_items", item_id, clean)
    if not updated:
        raise ValueError("Menu item not found.")
    return updated


async def list_restaurant_orders(restaurant_id: str, user: Dict[str, Any]) -> List[Dict[str, Any]]:
    await require_restaurant_access(restaurant_id, user)
    orders = await database.find_many("food_orders", {"restaurant_id": restaurant_id})
    return sorted(orders, key=lambda item: str(item.get("created_at") or ""), reverse=True)


async def update_restaurant_order_status(
    order_id: str,
    status: str,
    note: str | None,
    user: Dict[str, Any],
) -> Dict[str, Any]:
    order = await database.find_one("food_orders", {"id": order_id})
    if not order:
        raise ValueError("Order not found.")
    await require_restaurant_access(order["restaurant_id"], user)

    current = str(order.get("restaurant_status") or order.get("status") or "")
    if status == current:
        return order
    if not _is_admin(user) and status not in MERCHANT_ORDER_TRANSITIONS.get(current, set()):
        raise ValueError(f"Merchant cannot move order from {current} to {status}.")

    now = now_iso()
    updates: Dict[str, Any] = {
        "restaurant_status": status,
        "updated_at": now,
    }
    if status in {"ACCEPTED", "PREPARING", "READY_FOR_PICKUP", "REJECTED"}:
        updates["status"] = status
    if current == "PLACED" and status in {"ACCEPTED", "PREPARING"}:
        updates["accepted_at"] = now
    if status == "PREPARING":
        updates["preparing_at"] = now
    if status == "READY_FOR_PICKUP":
        updates["ready_for_pickup_at"] = now
    if status == "REJECTED":
        updates["fulfillment_status"] = "NOT_STARTED"
        updates["rejected_at"] = now

    updated = await database.update_one_if(
        "food_orders",
        {"id": order_id, "restaurant_status": order.get("restaurant_status") or order.get("status")},
        updates,
    )
    if not updated:
        raise ValueError("Order changed while it was being updated. Refresh and try again.")

    if current == "PLACED" and status == "PREPARING":
        await append_order_event(
            order_id,
            "RESTAURANT_ACCEPTED",
            actor_user_id=_user_id(user),
            data={"from": current, "to": "ACCEPTED", "note": note},
        )

    await append_order_event(
        order_id,
        f"RESTAURANT_{status}",
        actor_user_id=_user_id(user),
        data={"from": current, "to": status, "note": note},
    )

    # Accepting an order is the dispatch trigger. The merchant UI now combines
    # acceptance and prep start into one action, while existing ACCEPTED orders
    # remain supported for backward compatibility.
    if current == "PLACED" and status in {"ACCEPTED", "PREPARING"}:
        delivery = await ensure_food_order_delivery(order_id, actor_user_id=_user_id(user))
        quoted = await maybe_auto_quote_delivery(delivery["id"], actor_user_id=_user_id(user))
        await append_order_event(
            order_id,
            "COURIER_MATCHING_STARTED",
            actor_user_id=_user_id(user),
            data={
                "delivery_id": quoted.get("id"),
                "delivery_status": quoted.get("status"),
                "quote_status": quoted.get("quote_status"),
            },
        )

    refreshed = await database.find_one("food_orders", {"id": order_id})
    return refreshed or updated