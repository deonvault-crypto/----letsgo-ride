from __future__ import annotations

from typing import Any, Dict, List

from app.database import database
from app.services.food_service import append_order_event
from app.services.notification_service import create_app_notification
from app.utils import new_id, now_iso


MERCHANT_ORDER_TRANSITIONS = {
    "PENDING_RESTAURANT": {"PREPARING", "REJECTED"},
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
        # The current checkout contract is cash on delivery, so there is no
        # platform-held balance to disburse. Do not imply a configured payout.
        "payout_status": "NOT_REQUIRED_CASH_ON_DELIVERY",
        "staff_user_ids": [],
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
    current = await database.find_one("restaurants", {"id": restaurant_id})
    clean = {key: value for key, value in updates.items() if value is not None}
    if clean.get("is_accepting_orders") is True and current and current.get("status") != "ACTIVE":
        raise ValueError("Restaurant approval and activation are required before accepting orders.")
    clean["updated_at"] = now_iso()
    updated = await database.update_one("restaurants", restaurant_id, clean)
    if not updated:
        raise ValueError("Restaurant not found.")
    return updated


async def submit_restaurant_for_review(restaurant_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    restaurant = await require_restaurant_access(restaurant_id, user)
    if restaurant.get("status") not in {"DRAFT", "REJECTED"}:
        raise ValueError("Only a draft or rejected restaurant can be submitted for review.")
    categories = await database.find_many("menu_categories", {"restaurant_id": restaurant_id})
    items = await database.find_many("menu_items", {"restaurant_id": restaurant_id})
    if not str(restaurant.get("address") or "").strip():
        raise ValueError("Add a restaurant address before submitting for review.")
    location = restaurant.get("location")
    if not isinstance(location, dict) or not isinstance(location.get("latitude"), (int, float)) or not isinstance(location.get("longitude"), (int, float)):
        raise ValueError("Pin the restaurant pickup location before submitting for review.")
    if not restaurant.get("opening_hours"):
        raise ValueError("Add operating hours before submitting for review.")
    if not str(restaurant.get("contact_person_name") or "").strip():
        raise ValueError("Add a contact person before submitting for review.")
    if not categories or not items:
        raise ValueError("Add at least one menu category and item before submitting for review.")
    updated = await database.update_one(
        "restaurants",
        restaurant_id,
        {
            "status": "SUBMITTED",
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
    if restaurant.get("status") not in {"APPROVED", "ACTIVE"}:
        raise ValueError("Restaurant must be approved before activation.")
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


async def review_restaurant(
    restaurant_id: str,
    status: str,
    note: str | None,
    user: Dict[str, Any],
) -> Dict[str, Any]:
    if not _is_admin(user):
        raise PermissionError("Only an administrator can review restaurants.")
    restaurant = await database.find_one("restaurants", {"id": restaurant_id})
    if not restaurant:
        raise ValueError("Restaurant not found.")
    current = str(restaurant.get("status") or "DRAFT")
    allowed = {
        "SUBMITTED": {"UNDER_REVIEW", "APPROVED", "REJECTED"},
        "UNDER_REVIEW": {"APPROVED", "REJECTED"},
        "APPROVED": {"SUSPENDED"},
        "ACTIVE": {"SUSPENDED"},
        "SUSPENDED": {"UNDER_REVIEW", "APPROVED"},
    }
    if status not in allowed.get(current, set()) and status != current:
        raise ValueError(f"Restaurant cannot move from {current} to {status}.")
    now = now_iso()
    updates: Dict[str, Any] = {
        "status": status,
        "review_note": note,
        "updated_at": now,
    }
    if status in {"REJECTED", "SUSPENDED", "UNDER_REVIEW"}:
        updates["is_accepting_orders"] = False
    if status == "APPROVED":
        updates["approved_at"] = now
        updates["is_accepting_orders"] = False
    updated = await database.update_one("restaurants", restaurant_id, updates)
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
    restaurant = await require_restaurant_access(order["restaurant_id"], user)

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
    if status == "PREPARING":
        updates["status"] = "PREPARING"
        updates["accepted_at"] = now
    elif status == "READY_FOR_PICKUP":
        updates["status"] = "READY_FOR_PICKUP"
        updates["ready_for_pickup_at"] = now
    elif status == "REJECTED":
        updates["status"] = "REJECTED"
        updates["fulfillment_status"] = "CANCELLED"
        updates["rejected_at"] = now
        updates["cancellation_reason"] = note or "The restaurant could not accept this order."
    elif _is_admin(user):
        updates["status"] = status

    updated = await database.update_one_if(
        "food_orders",
        {"id": order_id, "restaurant_status": order.get("restaurant_status") or order.get("status")},
        updates,
    )
    if not updated:
        raise ValueError("Order changed while it was being updated. Refresh and try again.")

    await append_order_event(
        order_id,
        f"RESTAURANT_{status}",
        actor_user_id=_user_id(user),
        data={"from": current, "to": status, "note": note},
    )

    customer_user_id = str(order.get("customer_user_id") or "")
    if status == "PREPARING" and customer_user_id:
        await append_order_event(
            order_id,
            "ORDER_CONFIRMED",
            actor_user_id=_user_id(user),
            data={"restaurant_id": restaurant["id"]},
        )
        await create_app_notification(
            customer_user_id,
            "food_update",
            "Order accepted",
            f"{restaurant.get('name') or 'The restaurant'} is preparing your food. We are now finding a courier.",
            {
                "food_order_id": order_id,
                "restaurant_id": restaurant["id"],
                "notification_target": "customer_food_order",
            },
        )
    elif status == "REJECTED" and customer_user_id:
        await create_app_notification(
            customer_user_id,
            "food_update",
            "Order not accepted",
            note or f"{restaurant.get('name') or 'The restaurant'} could not accept this order.",
            {
                "food_order_id": order_id,
                "restaurant_id": restaurant["id"],
                "notification_target": "customer_food_order",
            },
        )
    elif status == "READY_FOR_PICKUP":
        if customer_user_id:
            await create_app_notification(
                customer_user_id,
                "food_update",
                "Your order is ready",
                f"{restaurant.get('name') or 'The restaurant'} has finished preparing your order.",
                {
                    "food_order_id": order_id,
                    "restaurant_id": restaurant["id"],
                    "notification_target": "customer_food_order",
                },
            )

        delivery_id = str(order.get("courier_delivery_id") or "")
        if delivery_id:
            delivery = await database.find_one("courier_deliveries", {"id": delivery_id})
            courier_user_id = str(delivery.get("courier_user_id") or "") if delivery else ""
            if courier_user_id:
                await create_app_notification(
                    courier_user_id,
                    "food_update",
                    "Order ready for pickup",
                    f"{restaurant.get('name') or 'The restaurant'} has the order ready for collection.",
                    {
                        "food_order_id": order_id,
                        "delivery_id": delivery_id,
                        "notification_target": "courier_delivery",
                    },
                )

    refreshed = await database.find_one("food_orders", {"id": order_id})
    return refreshed or updated
