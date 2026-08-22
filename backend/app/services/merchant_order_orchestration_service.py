from __future__ import annotations

from typing import Any, Dict

from app.database import database
from app.services.delivery_quote_service import maybe_auto_quote_delivery
from app.services.merchant_service import update_restaurant_order_status


async def transition_merchant_order(
    order_id: str,
    status: str,
    note: str | None,
    user: Dict[str, Any],
) -> Dict[str, Any]:
    """Apply the merchant state transition, then orchestrate downstream delivery work."""
    order = await update_restaurant_order_status(order_id, status, note, user)

    if status != "READY_FOR_PICKUP":
        return order

    delivery_id = order.get("courier_delivery_id")
    if not delivery_id:
        return order

    await maybe_auto_quote_delivery(
        str(delivery_id),
        actor_user_id=str(user.get("id") or ""),
    )
    refreshed = await database.find_one("food_orders", {"id": order_id})
    return refreshed or order
