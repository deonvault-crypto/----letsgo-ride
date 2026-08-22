from __future__ import annotations

from typing import Any, Dict

from app.database import database
from app.services.merchant_service import require_restaurant_access


async def get_restaurant_workspace(restaurant_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    restaurant = await require_restaurant_access(restaurant_id, user)
    categories = await database.find_many("menu_categories", {"restaurant_id": restaurant_id})
    items = await database.find_many("menu_items", {"restaurant_id": restaurant_id})
    orders = await database.find_many("food_orders", {"restaurant_id": restaurant_id})

    categories = sorted(categories, key=lambda item: int(item.get("sort_order") or 0))
    items = sorted(items, key=lambda item: (str(item.get("category_id") or ""), str(item.get("name") or "").lower()))
    orders = sorted(orders, key=lambda item: str(item.get("created_at") or ""), reverse=True)

    return {
        "restaurant": restaurant,
        "categories": categories,
        "items": items,
        "orders": orders,
    }
