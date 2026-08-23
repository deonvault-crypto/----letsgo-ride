from __future__ import annotations

from typing import Any, Dict

from app.services.delivery_quote_service import customer_quote_preview
from app.services.food_service import get_restaurant
from app.services.pricing_service import PricingNotConfiguredError
from app.services.routing_service import RoutingError


async def preview_food_checkout(payload: Dict[str, Any]) -> Dict[str, Any]:
    restaurant = await get_restaurant(str(payload.get("restaurant_id") or ""))
    if not restaurant.get("is_accepting_orders", True):
        raise ValueError("This restaurant is closed for orders right now.")

    restaurant_location = restaurant.get("location")
    if not isinstance(restaurant_location, dict):
        raise ValueError("This restaurant does not have a delivery pickup pin yet.")

    try:
        quote = await customer_quote_preview(
            str(restaurant.get("address") or "Restaurant pickup"),
            str(payload.get("delivery_address") or "Delivery address"),
            pickup_location=restaurant_location,
            dropoff_location=payload.get("delivery_location"),
        )
    except (RoutingError, PricingNotConfiguredError) as exc:
        raise ValueError("Delivery pricing is temporarily unavailable. Try again in a moment.") from exc

    return {
        "restaurant_id": restaurant["id"],
        "currency": quote["currency"],
        "delivery_fee_usd": quote["price_usd"],
        "distance_km": quote["distance_km"],
        "estimated_duration_minutes": quote["estimated_duration_minutes"],
        "pickup_address": quote["pickup_address"],
        "dropoff_address": quote["dropoff_address"],
    }
