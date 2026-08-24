from __future__ import annotations

import logging
from typing import Any, Dict

from app.database import database
from app.services.fulfillment_link_service import sync_food_order_pricing
from app.services.courier_delivery_realtime_service import (
    append_delivery_journey_event,
    publish_delivery_realtime,
    update_versioned_delivery,
)
from app.services.pricing_service import PricingNotConfiguredError, calculate_delivery_pricing
from app.services.routing_service import RoutingError, resolve_route, routing_status
from app.utils import now_iso


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


async def calculate_delivery_quote(
    pickup_address: str,
    dropoff_address: str,
    *,
    pickup_location: Dict[str, float] | None = None,
    dropoff_location: Dict[str, float] | None = None,
) -> Dict[str, Any]:
    """Resolve a real route and calculate server-owned delivery pricing.

    This function is used both for customer previews and final server-side quoting.
    The mobile client never supplies or calculates commercial pricing.
    """
    if not routing_status().get("configured"):
        raise RoutingError("Routing is not configured.")

    route = await resolve_route(
        pickup_address,
        dropoff_address,
        origin=_normalize_point(pickup_location),
        destination=_normalize_point(dropoff_location),
        include_polyline=True,
    )
    pricing = calculate_delivery_pricing(
        distance_km=float(route["distance_km"]),
        estimated_duration_minutes=int(route["estimated_duration_minutes"]),
    )
    return {"route": route, "pricing": pricing}


async def customer_quote_preview(
    pickup_address: str,
    dropoff_address: str,
    *,
    pickup_location: Dict[str, float] | None = None,
    dropoff_location: Dict[str, float] | None = None,
) -> Dict[str, Any]:
    """Return only customer-safe quote fields; courier payout is intentionally omitted."""
    calculated = await calculate_delivery_quote(
        pickup_address,
        dropoff_address,
        pickup_location=pickup_location,
        dropoff_location=dropoff_location,
    )
    route = calculated["route"]
    pricing = calculated["pricing"]
    return {
        "currency": pricing["currency"],
        "price_usd": pricing["price_usd"],
        "distance_km": pricing["distance_km"],
        "estimated_duration_minutes": pricing["estimated_duration_minutes"],
        "pricing_source": pricing["pricing_source"],
        "route_provider": route["provider"],
        "pickup_address": route["origin_address"],
        "dropoff_address": route["destination_address"],
        "pickup_location": route["origin"],
        "dropoff_location": route["destination"],
    }


async def apply_calculated_delivery_quote(
    delivery: Dict[str, Any],
    calculated: Dict[str, Any],
    *,
    actor_user_id: str | None = None,
) -> Dict[str, Any]:
    route = calculated["route"]
    pricing = calculated["pricing"]
    delivery_id = str(delivery["id"])
    now = now_iso()

    updates = {
        "quote_status": "READY",
        "price_usd": pricing["price_usd"],
        "courier_payout_usd": pricing["courier_payout_usd"],
        "distance_km": pricing["distance_km"],
        "estimated_duration_minutes": pricing["estimated_duration_minutes"],
        "pricing_source": pricing["pricing_source"],
        "route_provider": route["provider"],
        # Persist provider-resolved coordinates so customer and courier maps work even
        # when the request started from address text only.
        "pickup_location": route["origin"],
        "dropoff_location": route["destination"],
        "route_polyline": route.get("encoded_polyline"),
        "updated_at": now,
    }
    if delivery.get("status") == "REQUESTED" and not delivery.get("courier_user_id"):
        updates["status"] = "MATCHING"

    updated = await update_versioned_delivery(
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

    journey_event = await append_delivery_journey_event(
        delivery_id,
        "DELIVERY_AUTO_QUOTED",
        actor_user_id=actor_user_id,
        data={
            "price_usd": updated.get("price_usd"),
            "courier_payout_usd": updated.get("courier_payout_usd"),
            "distance_km": updated.get("distance_km"),
            "estimated_duration_minutes": updated.get("estimated_duration_minutes"),
            "route_provider": updated.get("route_provider"),
        },
    )
    await publish_delivery_realtime(updated, "courier_delivery.route_updated", journey_event=journey_event)
    await sync_food_order_pricing(updated, actor_user_id=actor_user_id)
    return updated


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

    try:
        calculated = await calculate_delivery_quote(
            str(delivery.get("pickup_address") or ""),
            str(delivery.get("dropoff_address") or ""),
            pickup_location=_normalize_point(delivery.get("pickup_location")),
            dropoff_location=_normalize_point(delivery.get("dropoff_location")),
        )
    except PricingNotConfiguredError:
        return delivery
    except RoutingError as exc:
        logger.warning(
            "delivery_auto_quote_routing_failed delivery_id=%s error=%s",
            delivery_id,
            type(exc).__name__,
        )
        return delivery

    return await apply_calculated_delivery_quote(
        delivery,
        calculated,
        actor_user_id=actor_user_id,
    )
