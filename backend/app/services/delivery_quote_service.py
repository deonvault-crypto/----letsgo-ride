from __future__ import annotations

import logging
from typing import Any, Dict

from app.database import database
from app.services.fulfillment_link_service import sync_food_order_pricing
from app.services.pricing_service import PricingNotConfiguredError, calculate_delivery_pricing
from app.services.routing_service import RoutingError, resolve_route, routing_status
from app.utils import new_id, now_iso


logger = logging.getLogger(__name__)
FINAL_STATUSES = {"DELIVERED", "CANCELLED", "FAILED"}


def _normalize_point(value: Any) -> Dict[str, float] | None:
    if not isinstance(value, dict):
        return None
    latitude = value.get("latitude")
    longitude = value.get("longitude")
    if not isinstance(latitude, (int, float)) or not isinstance(longitude, (int, float)):
        return None
    return {"latitude": float(latitude), "longitude": float(longitude)}


async def maybe_auto_quote_delivery(
    delivery_id: str,
    *,
    actor_user_id: str | None = None,
) -> Dict[str, Any]:
    """Best-effort auto quote. Failure leaves the job pending for safe manual operations fallback."""
    delivery = await database.find_one("courier_deliveries", {"id": delivery_id})
    if not delivery:
        raise ValueError("Delivery not found.")
    if delivery.get("status") in FINAL_STATUSES or delivery.get("quote_status") == "READY":
        return delivery

    if not routing_status().get("configured"):
        return delivery

    try:
        route = await resolve_route(
            str(delivery.get("pickup_address") or ""),
            str(delivery.get("dropoff_address") or ""),
            origin=_normalize_point(delivery.get("pickup_location")),
            destination=_normalize_point(delivery.get("dropoff_location")),
            include_polyline=False,
        )
        pricing = calculate_delivery_pricing(
            distance_km=float(route["distance_km"]),
            estimated_duration_minutes=int(route["estimated_duration_minutes"]),
        )
    except PricingNotConfiguredError:
        return delivery
    except RoutingError as exc:
        logger.warning("delivery_auto_quote_routing_failed delivery_id=%s error=%s", delivery_id, type(exc).__name__)
        return delivery

    now = now_iso()
    updates = {
        "quote_status": "READY",
        "price_usd": pricing["price_usd"],
        "courier_payout_usd": pricing["courier_payout_usd"],
        "distance_km": pricing["distance_km"],
        "estimated_duration_minutes": pricing["estimated_duration_minutes"],
        "pricing_source": pricing["pricing_source"],
        "route_provider": route["provider"],
        "updated_at": now,
    }
    if delivery.get("status") == "REQUESTED" and not delivery.get("courier_user_id"):
        updates["status"] = "MATCHING"

    updated = await database.update_one_if(
        "courier_deliveries",
        {
            "id": delivery_id,
            "quote_status": delivery.get("quote_status"),
            "status": delivery.get("status"),
        },
        updates,
    )
    if not updated:
        current = await database.find_one("courier_deliveries", {"id": delivery_id})
        return current or delivery

    await database.insert_one(
        "courier_events",
        {
            "id": new_id(),
            "delivery_id": delivery_id,
            "type": "DELIVERY_AUTO_QUOTED",
            "actor_user_id": actor_user_id,
            "data": {
                "price_usd": updated.get("price_usd"),
                "courier_payout_usd": updated.get("courier_payout_usd"),
                "distance_km": updated.get("distance_km"),
                "estimated_duration_minutes": updated.get("estimated_duration_minutes"),
                "route_provider": updated.get("route_provider"),
            },
            "created_at": now_iso(),
        },
    )
    await sync_food_order_pricing(updated, actor_user_id=actor_user_id)
    return updated
