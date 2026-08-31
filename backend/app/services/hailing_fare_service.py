from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
import os
from typing import Any, Dict

from app.database import database
from app.services.hailing_city_service import get_city, resolve_service_area
from app.services.routing_service import RoutingError, compute_route
from app.utils import new_id, now_iso


QUOTE_TTL_SECONDS = 180
LAUNCH_RIDE_CLASSES = {"ECONOMY", "COMFORT", "XL"}
# These values mirror the Zimbabwe launch pricing table. They are also a compatibility
# bridge for cities seeded before Comfort/XL were turned on: old `enabled=false`
# flags must not make the customer UI advertise a class that the quote engine rejects.
LAUNCH_CLASS_PRICING = {
    "ECONOMY": {
        "base_fare": 0.45,
        "per_km": 0.28,
        "per_minute": 0.025,
        "minimum_fare": 1.00,
        "booking_fee": 0.00,
        "cancellation_fee": 0.00,
        "platform_commission_percent": 3.0,
        "maximum_pickup_radius_km": 15.0,
        "surge_multiplier": 1.0,
    },
    "COMFORT": {
        "base_fare": 0.60,
        "per_km": 0.36,
        "per_minute": 0.03,
        "minimum_fare": 1.40,
        "booking_fee": 0.00,
        "cancellation_fee": 0.00,
        "platform_commission_percent": 3.0,
        "maximum_pickup_radius_km": 12.0,
        "surge_multiplier": 1.0,
    },
    "XL": {
        "base_fare": 0.75,
        "per_km": 0.42,
        "per_minute": 0.04,
        "minimum_fare": 1.80,
        "booking_fee": 0.00,
        "cancellation_fee": 0.00,
        "platform_commission_percent": 3.0,
        "maximum_pickup_radius_km": 10.0,
        "surge_multiplier": 1.0,
    },
}


def money(value: float) -> float:
    return float(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def quote_expired(quote: Dict[str, Any]) -> bool:
    try:
        return datetime.fromisoformat(str(quote.get("expires_at"))) <= datetime.now(timezone.utc)
    except (TypeError, ValueError):
        return True


def _driver_launch_full_fare_enabled() -> bool:
    """Keep Ride Now Driver deductions at zero during the introductory launch.

    Production defaults to the introductory policy so a missed environment variable
    cannot accidentally charge Drivers. Set DRIVER_LAUNCH_FULL_FARE=false when the
    introductory period is deliberately ended.
    """
    configured = os.getenv("DRIVER_LAUNCH_FULL_FARE")
    if configured is not None:
        return configured.strip().lower() in {"1", "true", "yes", "on"}
    return os.getenv("APP_ENV", "development").strip().lower() == "production"


def public_route(route: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize provider-internal routing fields into the stable mobile API contract."""
    distance_km = route.get("distance_km")
    if distance_km is None and route.get("distance_meters") is not None:
        distance_km = float(route["distance_meters"]) / 1000.0
    duration_minutes = route.get("duration_minutes")
    if duration_minutes is None:
        duration_minutes = route.get("estimated_duration_minutes")
    if duration_minutes is None and route.get("duration_seconds") is not None:
        duration_minutes = float(route["duration_seconds"]) / 60.0
    return {
        "distance_km": round(float(distance_km or 0), 3),
        "duration_minutes": max(1, int(round(float(duration_minutes or 1)))),
        "polyline": route.get("polyline") or route.get("encoded_polyline"),
    }


def _pricing_for_launch(city: Dict[str, Any], ride_class: str) -> Dict[str, Any]:
    if ride_class not in LAUNCH_RIDE_CLASSES:
        raise ValueError("That ride class is not available in this service area.")
    baseline = dict(LAUNCH_CLASS_PRICING[ride_class])
    stored = dict((city.get("pricing") or {}).get(ride_class) or {})
    # Keep explicit numeric/admin pricing overrides, but the current launch product
    # has all three classes enabled. This removes the old Economy-only rollout flag
    # from the quote path without discarding the city's actual fare configuration.
    baseline.update({key: value for key, value in stored.items() if key != "enabled"})
    baseline["enabled"] = True
    return baseline


def calculate_fare(
    city: Dict[str, Any],
    ride_class: str,
    distance_km: float,
    duration_minutes: float,
) -> Dict[str, Any]:
    class_pricing = _pricing_for_launch(city, ride_class)
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
    configured_percent = float(class_pricing.get("platform_commission_percent") or 0)
    commission_percent = 0.0 if _driver_launch_full_fare_enabled() else configured_percent
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
    ride_class = str(payload["ride_class"] or "").upper()
    if ride_class not in LAUNCH_RIDE_CLASSES:
        raise ValueError("That ride class is not available from this pickup area.")
    resolved = await resolve_service_area(float(pickup["latitude"]), float(pickup["longitude"]))
    if not resolved.get("enabled"):
        raise ValueError("Ride Now is not available from that pickup area yet.")
    city = await get_city(resolved["service_area"]["id"])
    if not city:
        raise ValueError("Ride Now service area is unavailable.")
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

    normalized_route = public_route(route)
    fare = calculate_fare(
        city,
        ride_class,
        float(normalized_route["distance_km"]),
        float(normalized_route["duration_minutes"]),
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
    fare = dict(quote.get("fare") or {})
    normalized_route = public_route(quote.get("route") or {})
    return {
        "quote_id": quote.get("id"),
        "city_id": quote.get("city_id"),
        "pickup": quote.get("pickup"),
        "dropoff": quote.get("dropoff"),
        "route": normalized_route,
        "fare": fare,
        "currency": fare.get("currency") or "USD",
        "ride_class": fare.get("ride_class"),
        "expires_at": quote.get("expires_at"),
        **fare,
    }
