from __future__ import annotations

from typing import Any, Dict, List

from app.database import database
from app.services.food_service import get_customer_order


FOOD_ORDER_HISTORY_LIMIT = 100
FOOD_EVENT_LIMIT = 100


async def list_customer_orders_scaled(user: Dict[str, Any]) -> List[Dict[str, Any]]:
    return await database.find_many(
        "food_orders",
        {"customer_user_id": str(user.get("id") or "")},
        sort=[("created_at", -1)],
        limit=FOOD_ORDER_HISTORY_LIMIT,
    )


async def list_order_events_scaled(order_id: str, user: Dict[str, Any]) -> List[Dict[str, Any]]:
    await get_customer_order(order_id, user)
    events = await database.find_many(
        "food_order_events",
        {"order_id": order_id},
        sort=[("created_at", -1)],
        limit=FOOD_EVENT_LIMIT,
    )
    events.reverse()
    return events
