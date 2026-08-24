from __future__ import annotations

import logging
from typing import Any, Dict

from app.database import database
from app.models.event import RealtimeAudience
from app.services.event_service import realtime_event_service
from app.utils import new_id, now_iso


logger = logging.getLogger(__name__)
TERMINAL_FOOD_STATUSES = {"DELIVERED", "CANCELLED", "REJECTED"}


def food_order_realtime_version(order: Dict[str, Any]) -> int:
    value = order.get("realtime_version", 0)
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else 0


async def insert_versioned_food_order(order: Dict[str, Any]) -> Dict[str, Any]:
    return await database.insert_one("food_orders", {**order, "realtime_version": 1})


async def update_versioned_food_order(
    filters: Dict[str, Any],
    updates: Dict[str, Any],
) -> Dict[str, Any] | None:
    return await database.update_one_atomic(
        "food_orders",
        filters,
        updates,
        {"realtime_version": 1},
    )


async def append_food_order_event(
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


def _audience(order: Dict[str, Any]) -> RealtimeAudience:
    customer_id = str(order.get("customer_user_id") or "")
    restaurant_id = str(order.get("restaurant_id") or "")
    return RealtimeAudience(
        user_ids=frozenset({customer_id}) if customer_id else frozenset(),
        restaurant_ids=frozenset({restaurant_id}) if restaurant_id else frozenset(),
        roles=frozenset({"admin"}),
    )


def _state_payload(order: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "restaurant_id": order.get("restaurant_id"),
        "status": order.get("status"),
        "restaurant_status": order.get("restaurant_status"),
        "fulfillment_status": order.get("fulfillment_status"),
        "realtime_version": food_order_realtime_version(order),
        "courier_delivery_id": order.get("courier_delivery_id"),
        "delivery_fee_usd": order.get("delivery_fee_usd"),
        "total_usd": order.get("total_usd"),
        "pricing_status": order.get("pricing_status"),
        "cancellation_reason": order.get("cancellation_reason"),
        "delivered_at": order.get("delivered_at"),
        "cancelled_at": order.get("cancelled_at"),
        "updated_at": order.get("updated_at"),
    }


def _merchant_ticket(order: Dict[str, Any]) -> Dict[str, Any]:
    """Return only the operational fields needed to render a new Merchant ticket."""
    return {
        "id": order.get("id"),
        "restaurant_id": order.get("restaurant_id"),
        "restaurant_name": order.get("restaurant_name"),
        "customer_name": order.get("customer_name"),
        "status": order.get("status"),
        "restaurant_status": order.get("restaurant_status"),
        "fulfillment_status": order.get("fulfillment_status"),
        "payment_method": order.get("payment_method"),
        "payment_status": order.get("payment_status"),
        "delivery_address": order.get("delivery_address"),
        "recipient_name": order.get("recipient_name"),
        "items": order.get("items") or [],
        "subtotal_usd": order.get("subtotal_usd"),
        "delivery_fee_usd": order.get("delivery_fee_usd"),
        "total_usd": order.get("total_usd"),
        "pricing_status": order.get("pricing_status"),
        "currency": order.get("currency"),
        "courier_delivery_id": order.get("courier_delivery_id"),
        "created_at": order.get("created_at"),
        "updated_at": order.get("updated_at"),
        "realtime_version": food_order_realtime_version(order),
    }


async def publish_food_order_realtime(
    order: Dict[str, Any],
    event_type: str,
    *,
    journey_event: Dict[str, Any] | None = None,
) -> bool:
    """Best-effort publication after committed Food order truth."""
    payload = _state_payload(order)
    if event_type == "food_order.created":
        payload["merchant_ticket"] = _merchant_ticket(order)
    if journey_event:
        payload["journey_event"] = {
            "id": journey_event.get("id"),
            "order_id": order.get("id"),
            "type": journey_event.get("type"),
            "created_at": journey_event.get("created_at"),
        }
    try:
        published = await realtime_event_service.publish(
            realtime_event_service.build_event(
                event_type=event_type,
                resource_type="food_order",
                resource_id=str(order.get("id") or ""),
                version=food_order_realtime_version(order),
                audience=_audience(order),
                payload=payload,
            )
        )
        if not published:
            logger.warning(
                "food_order_realtime_unavailable order_id=%s version=%s",
                order.get("id"),
                food_order_realtime_version(order),
            )
        return published
    except Exception as exc:
        logger.warning(
            "food_order_realtime_publish_failed order_id=%s version=%s error=%s",
            order.get("id"),
            food_order_realtime_version(order),
            type(exc).__name__,
        )
        return False


def food_order_event_type(order: Dict[str, Any], *, fulfillment: bool = False) -> str:
    if str(order.get("status") or "") in TERMINAL_FOOD_STATUSES:
        return "food_order.terminal"
    return "food_order.fulfillment_updated" if fulfillment else "food_order.updated"
