from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict

from app.database import database
from app.services.hailing_city_service import get_city, resolve_service_area
from app.services.routing_service import RoutingError, compute_route
from app.utils import new_id, now_iso


QUOTE_TTL_SECONDS = 180


def money(value: float) -> float:
    return float(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def quote_expired(quote: Dict[str, Any]) -> bool:
    try:
        return datetime.fromisoformat(str(quote.get("expires_at"))) <= datetime.now(timezone.utc)
    except (TypeError, ValueError):
        return True


def calculate_fare(
    city: Dict[str, Any],
    ride_class: str,
    distance_km: float,
    duration_minutes: float,
) -> Dict[str, Any]:
    class_pricing = (city.get("pricing") or {}).get(ride_class)
    if not class_pricing or not class_pricing.get("enabled"):
        raise ValueError("That ride class is not available in this service area.")
    surge = float(class_pricing.get("surge_multiplier") or 1.0)
    if surge < 1.0 or surge > 3.0:
        raise ValueError("Ride pricing is temporarily unavailable.")
    base_fare = money(float(class_pricing.get("base_fare") or 0))
    distance_fare = money(distance_km * float(class_pricing.get("per_km") or 0))
    time_fare = money(duration_minutes * float(class_pricing.get("per_minute") or 0))
    booking_fee = money(float(class_pricing.get("booking_fee") or 0))
    minimum_fare = money(float(class_pricing.get("minimum_fare") or 0))
    subtotal = money(base_fare + distance_fare + time_fare + booking_fee)
    total_fare = money(max(minimum_fare, subtotal * surge))
    commission_percent = float(class_pricing.get("platform_commission_percent") or 0)
    platform_commission = money(total_fare * commission_percent / 100)
    driver_earnings = money(max(0, total_fare - platform_commission))
    return {
        "currency": city.get("currency") or "USD",
        "ride_class": ride_class,
        "distance_km": round(float(distance_km), 3),
        "duration_minutes": max(1, int(round(float(duration_minutes)))),
        "base_fare": base_fare,
        "distance_fare": distance_fare,
        "time_fare": time_fare,
        "booking_fee": booking_fee,
        "minimum_fare": minimum_fare,
        "surge_multiplier": surge,
        "total_fare": total_fare,
        "estimated_driver_earnings": driver_earnings,
        "platform_commission": platform_commission,
        "platform_commission_percent": commission_percent,
        "high_demand": surge > 1.0,
    }


async def create_quote(payload: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    pickup = payload["pickup"]
    dropoff = payload["dropoff"]
    ride_class = payload["ride_class"]
    resolved = await resolve_service_area(float(pickup["latitude"]), float(pickup["longitude"]))
    if not resolved.get("enabled"):
        raise ValueError("Ride Now is not available from that pickup area yet.")
    city = await get_city(resolved["service_area"]["id"])
    if not city:
        raise ValueError("Ride Now service area is unavailable.")
    if ride_class not in resolved.get("ride_classes", []):
        raise ValueError("That ride class is not available from this pickup area.")
    dropoff_resolved = await resolve_service_area(float(dropoff["latitude"]), float(dropoff["longitude"]))
    if not dropoff_resolved.get("supported"):
        raise ValueError("Ride Now is not available to that destination yet.")
    try:
        route = await compute_route(
            {"latitude": pickup["latitude"], "longitude": pickup["longitude"]},
            {"latitude": dropoff["latitude"], "longitude": dropoff["longitude"]},
            include_polyline=True,
        )
    except RoutingError as exc:
        raise RuntimeError("Route and fare are temporarily unavailable.") from exc

    fare = calculate_fare(
        city,
        ride_class,
        float(route["distance_km"]),
        float(route["estimated_duration_minutes"]),
    )
    timestamp = now_iso()
    quote = {
        "id": new_id(),
        "user_id": user["id"],
        "city_id": city["id"],
        "pickup": {**pickup, "service_area_id": city["id"]},
        "dropoff": {**dropoff, "service_area_id": dropoff_resolved.get("service_area", {}).get("id")},
        "route": route,
        "fare": fare,
        "expires_at": (datetime.now(timezone.utc) + timedelta(seconds=QUOTE_TTL_SECONDS)).isoformat(),
        "created_at": timestamp,
        "updated_at": timestamp,
    }
    await database.insert_one("hailing_quotes", quote)
    return public_quote(quote)


def public_quote(quote: Dict[str, Any]) -> Dict[str, Any]:
    fare = quote.get("fare") or {}
    return {
        "quote_id": quote.get("id"),
        "city_id": quote.get("city_id"),
        "pickup": quote.get("pickup"),
        "dropoff": quote.get("dropoff"),
        "route": quote.get("route"),
        "expires_at": quote.get("expires_at"),
        **fare,
    }

