from __future__ import annotations

import math
from typing import Any, Dict, List, Optional

from app.config import get_settings
from app.database import database
from app.utils import now_iso


PRICING_VERSION = 3
LAUNCH_RIDE_CLASSES = ("ECONOMY", "COMFORT", "XL")

# Exact V1 values are retained only so seeded service areas can be migrated safely.
# A class is upgraded only when every stored field still matches this legacy profile;
# any admin-customized class is preserved as-is.
LEGACY_CITY_PRICING_V1 = {
    "ECONOMY": {
        "enabled": True,
        "base_fare": 2.00,
        "per_km": 0.80,
        "per_minute": 0.08,
        "minimum_fare": 3.00,
        "booking_fee": 0.50,
        "cancellation_fee": 0.00,
        "platform_commission_percent": 15.0,
        "maximum_pickup_radius_km": 15.0,
        "surge_multiplier": 1.0,
    },
    "COMFORT": {
        "enabled": False,
        "base_fare": 3.00,
        "per_km": 1.05,
        "per_minute": 0.10,
        "minimum_fare": 4.50,
        "booking_fee": 0.75,
        "cancellation_fee": 0.00,
        "platform_commission_percent": 15.0,
        "maximum_pickup_radius_km": 12.0,
        "surge_multiplier": 1.0,
    },
    "XL": {
        "enabled": False,
        "base_fare": 4.00,
        "per_km": 1.35,
        "per_minute": 0.12,
        "minimum_fare": 6.00,
        "booking_fee": 1.00,
        "cancellation_fee": 0.00,
        "platform_commission_percent": 15.0,
        "maximum_pickup_radius_km": 10.0,
        "surge_multiplier": 1.0,
    },
}

# Driver-first launch economics for Zimbabwe. Economy is intentionally tuned so
# ordinary short urban trips land around the $1-$3 range while distance/time still
# scale longer trips. Comfort/XL remain disabled by default but have sane future
# pricing rather than inheriting the old premium table.
DEFAULT_CITY_PRICING = {
    "ECONOMY": {
        "enabled": True,
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
        "enabled": True,
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
        "enabled": True,
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

DEFAULT_DISPATCH_SETTINGS = {
    "initial_radius_km": 2.0,
    "radius_steps_km": [2.0, 4.0, 8.0, 15.0],
    "maximum_radius_km": 15.0,
    "offer_timeout_seconds": 25,
    "search_timeout_seconds": 120,
    "driver_stale_seconds": 75,
    "dispatch_sweeper_interval_seconds": 3,
    "boarding_start_radius_meters": 250,
    # Legacy aliases are retained inside city records for backward-safe reads.
    "expansion_radii_km": [2.0, 4.0, 8.0, 15.0],
    "request_timeout_seconds": 120,
    "driver_stale_after_seconds": 75,
}

ZIMBABWE_SERVICE_AREAS = [
    ("Harare", "harare", "Harare Metropolitan", -17.824858, 31.053028, 35),
    ("Bulawayo", "bulawayo", "Bulawayo Metropolitan", -20.149812, 28.585388, 30),
    ("Chitungwiza", "chitungwiza", "Harare Metropolitan", -18.0127, 31.0756, 18),
    ("Mutare", "mutare", "Manicaland", -18.9707, 32.6709, 22),
    ("Gweru", "gweru", "Midlands", -19.4513, 29.8152, 22),
    ("Kwekwe", "kwekwe", "Midlands", -18.9281, 29.8149, 18),
    ("Kadoma", "kadoma", "Mashonaland West", -18.3333, 29.9167, 18),
    ("Masvingo", "masvingo", "Masvingo", -20.0744, 30.8328, 20),
    ("Chinhoyi", "chinhoyi", "Mashonaland West", -17.3667, 30.2000, 16),
    ("Marondera", "marondera", "Mashonaland East", -18.1853, 31.5519, 16),
    ("Victoria Falls", "victoria-falls", "Matabeleland North", -17.9243, 25.8560, 18),
    ("Hwange", "hwange", "Matabeleland North", -18.3645, 26.4988, 16),
    ("Kariba", "kariba", "Mashonaland West", -16.5167, 28.8000, 18),
    ("Bindura", "bindura", "Mashonaland Central", -17.3019, 31.3306, 16),
    ("Beitbridge", "beitbridge", "Matabeleland South", -22.2167, 30.0000, 18),
    ("Zvishavane", "zvishavane", "Midlands", -20.3267, 30.0665, 16),
    ("Redcliff", "redcliff", "Midlands", -19.0333, 29.7833, 12),
    ("Rusape", "rusape", "Manicaland", -18.5278, 32.1284, 14),
    ("Chegutu", "chegutu", "Mashonaland West", -18.1302, 30.1407, 14),
    ("Norton", "norton", "Mashonaland West", -17.8833, 30.7000, 14),
    ("Gwanda", "gwanda", "Matabeleland South", -20.9333, 29.0000, 16),
    ("Plumtree", "plumtree", "Matabeleland South", -20.4833, 27.8167, 14),
    ("Shurugwi", "shurugwi", "Midlands", -19.6702, 30.0059, 14),
    ("Chipinge", "chipinge", "Manicaland", -20.1883, 32.6236, 14),
    ("Chiredzi", "chiredzi", "Masvingo", -21.0500, 31.6667, 16),
    ("Karoi", "karoi", "Mashonaland West", -16.8167, 29.6833, 14),
    ("Gokwe", "gokwe", "Midlands", -18.2167, 28.9333, 14),
    ("Lupane", "lupane", "Matabeleland North", -18.9315, 27.8069, 14),
    ("Triangle", "triangle", "Masvingo", -21.0333, 31.4500, 12),
    ("Mvurwi", "mvurwi", "Mashonaland Central", -17.0333, 30.8500, 12),
]


def nationwide_city_ids() -> List[str]:
    return [f"zw-{slug}" for _, slug, _, _, _, _ in ZIMBABWE_SERVICE_AREAS]


def point(latitude: float, longitude: float) -> Dict[str, float]:
    return {"latitude": float(latitude), "longitude": float(longitude)}


def geojson_point(latitude: float, longitude: float) -> Dict[str, Any]:
    return {"type": "Point", "coordinates": [float(longitude), float(latitude)]}


def is_in_zimbabwe(latitude: float, longitude: float) -> bool:
    return -23.2 <= latitude <= -15.3 and 25.0 <= longitude <= 33.3


def haversine_km(a: Dict[str, float], b: Dict[str, float]) -> float:
    radius = 6371.0
    lat1 = math.radians(float(a["latitude"]))
    lat2 = math.radians(float(b["latitude"]))
    d_lat = lat2 - lat1
    d_lon = math.radians(float(b["longitude"]) - float(a["longitude"]))
    h = math.sin(d_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(d_lon / 2) ** 2
    return radius * 2 * math.atan2(math.sqrt(h), math.sqrt(1 - h))


def enabled_ride_classes(city: Dict[str, Any]) -> List[str]:
    _ = city
    return list(LAUNCH_RIDE_CLASSES)


def public_city(city: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": city.get("id"),
        "name": city.get("name"),
        "slug": city.get("slug"),
        "province": city.get("province"),
        "country": "Zimbabwe",
        "country_code": "ZW",
        "center": city.get("center"),
        "service_radius_km": city.get("service_radius_km"),
        "timezone": city.get("timezone") or "Africa/Harare",
        "currency": city.get("currency") or "USD",
        "enabled": bool(city.get("enabled")),
        "ride_hailing_enabled": bool(city.get("ride_hailing_enabled")),
        "pickup_enabled": bool(city.get("pickup_enabled")),
        "dropoff_enabled": bool(city.get("dropoff_enabled")),
        "ride_classes": enabled_ride_classes(city),
    }


def city_template(name: str, slug: str, province: str, latitude: float, longitude: float, radius: float) -> Dict[str, Any]:
    timestamp = now_iso()
    return {
        "id": f"zw-{slug}",
        "name": name,
        "slug": slug,
        "province": province,
        "country": "Zimbabwe",
        "country_code": "ZW",
        "center": point(latitude, longitude),
        "location": geojson_point(latitude, longitude),
        "polygon_geojson": None,
        "service_radius_km": float(radius),
        "timezone": "Africa/Harare",
        "currency": "USD",
        "enabled": True,
        "ride_hailing_enabled": True,
        "pickup_enabled": True,
        "dropoff_enabled": True,
        "pricing": {key: dict(value) for key, value in DEFAULT_CITY_PRICING.items()},
        "pricing_version": PRICING_VERSION,
        "dispatch": dict(DEFAULT_DISPATCH_SETTINGS),
        "created_at": timestamp,
        "updated_at": timestamp,
    }


def _migrate_legacy_pricing(existing: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    current_pricing = existing.get("pricing") or {}
    migrated = {key: dict(value) for key, value in current_pricing.items()}
    changed = False
    for ride_class in ("ECONOMY", "COMFORT", "XL"):
        current = current_pricing.get(ride_class)
        legacy = LEGACY_CITY_PRICING_V1[ride_class]
        if not isinstance(current, dict):
            continue
        if all(current.get(field) == value for field, value in legacy.items()):
            migrated[ride_class] = dict(DEFAULT_CITY_PRICING[ride_class])
            changed = True
            continue
        sanitized = dict(current)
        if sanitized.get("enabled") is not True:
            sanitized["enabled"] = True
            migrated[ride_class] = sanitized
            changed = True
    return migrated if changed else None


async def seed_zimbabwe_service_areas() -> None:
    for args in ZIMBABWE_SERVICE_AREAS:
        desired = city_template(*args)
        existing = await database.find_one("hailing_cities", {"slug": desired["slug"]})
        if existing:
            updates = {
                key: value
                for key, value in desired.items()
                if key in {"country", "country_code", "timezone", "currency", "location"}
            }
            migrated_pricing = _migrate_legacy_pricing(existing)
            if migrated_pricing is not None:
                updates["pricing"] = migrated_pricing
                updates["pricing_version"] = PRICING_VERSION
            await database.update_one("hailing_cities", existing["id"], {**updates, "updated_at": now_iso()})
            continue
        await database.insert_one("hailing_cities", desired)

    # The original city list was a launch rollout gate. Once Ride Now becomes a
    # Zimbabwe-wide product, migrate only already-enabled Drivers to every seeded
    # Zimbabwe area. Verification, class approval and account standing stay intact.
    all_city_ids = nationwide_city_ids()
    enabled_drivers = await database.find_many("drivers", {"hailing_enabled": True})
    for driver in enabled_drivers:
        current_ids = [str(value) for value in (driver.get("approved_hailing_city_ids") or [])]
        if set(current_ids) == set(all_city_ids):
            continue
        await database.update_one(
            "drivers",
            driver["id"],
            {"approved_hailing_city_ids": all_city_ids, "updated_at": now_iso()},
        )


async def list_service_areas(include_disabled: bool = False) -> List[Dict[str, Any]]:
    cities = await database.find_many("hailing_cities")
    if not include_disabled:
        cities = [city for city in cities if city.get("enabled")]
    return sorted(cities, key=lambda item: item.get("name") or "")


async def get_city(city_id: str) -> Optional[Dict[str, Any]]:
    return await database.find_one("hailing_cities", {"id": city_id}) or await database.find_one("hailing_cities", {"slug": city_id})


async def resolve_service_area(latitude: float, longitude: float) -> Dict[str, Any]:
    """Resolve every Zimbabwe pickup to its nearest local pricing/admin profile.

    Service radii remain useful metadata, but they no longer create invisible product
    walls between Zimbabwe towns. Dispatch remains separately bounded to nearby
    Drivers, so nationwide availability never means nationwide Driver fan-out.
    """
    settings = get_settings()
    if not is_in_zimbabwe(latitude, longitude):
        return {"supported": False, "enabled": False, "reason": "outside_zimbabwe", "service_area": None, "ride_classes": []}
    cities = await list_service_areas(include_disabled=True)
    origin = point(latitude, longitude)
    ranked = sorted(
        ((haversine_km(origin, city["center"]), city) for city in cities if city.get("center")),
        key=lambda item: item[0],
    )
    if not ranked:
        return {"supported": False, "enabled": False, "reason": "no_service_areas", "service_area": None, "ride_classes": []}
    distance, city = ranked[0]
    within_local_radius = distance <= float(city.get("service_radius_km") or 0)
    enabled = bool(settings.hailing_enabled and city.get("enabled") and city.get("ride_hailing_enabled"))
    classes = enabled_ride_classes(city) if enabled else []
    return {
        "supported": True,
        "enabled": enabled,
        "reason": "enabled" if enabled and within_local_radius else ("zimbabwe_nationwide" if enabled else "disabled"),
        "distance_to_center_km": round(distance, 3),
        "within_local_service_radius": within_local_radius,
        "service_area": public_city(city),
        "ride_classes": classes,
    }


def _pricing_from_update(data: Dict[str, Any], ride_class: str, existing: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    prefix = ride_class.lower()
    pricing = dict(DEFAULT_CITY_PRICING[ride_class])
    pricing.update((existing or {}).get("pricing", {}).get(ride_class, {}))
    fields = (
        "enabled",
        "base_fare",
        "per_km",
        "per_minute",
        "minimum_fare",
        "booking_fee",
        "cancellation_fee",
        "platform_commission_percent",
        "maximum_pickup_radius_km",
        "surge_multiplier",
    )
    for field in fields:
        key = f"{prefix}_{field}"
        if key in data:
            value = data.pop(key)
            if field != "enabled":
                pricing[field] = float(value)
    pricing["enabled"] = True
    return pricing


def _dispatch_from_update(data: Dict[str, Any], existing: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    dispatch = dict(DEFAULT_DISPATCH_SETTINGS)
    dispatch.update((existing or {}).get("dispatch") or {})
    numeric_fields = (
        "initial_radius_km",
        "maximum_radius_km",
        "offer_timeout_seconds",
        "search_timeout_seconds",
        "driver_stale_seconds",
        "dispatch_sweeper_interval_seconds",
        "boarding_start_radius_meters",
    )
    for field in numeric_fields:
        if field in data:
            dispatch[field] = data.pop(field)
    if "radius_steps_km" in data:
        dispatch["radius_steps_km"] = [float(radius) for radius in data.pop("radius_steps_km")]

    initial_radius = float(dispatch["initial_radius_km"])
    maximum_radius = float(dispatch["maximum_radius_km"])
    if initial_radius > maximum_radius:
        raise ValueError("Initial dispatch radius cannot exceed maximum dispatch radius.")
    requested_steps = [float(radius) for radius in dispatch.get("radius_steps_km") or []]
    radius_steps = sorted({radius for radius in requested_steps if 0 < radius <= maximum_radius})
    if initial_radius not in radius_steps:
        radius_steps.append(initial_radius)
    if maximum_radius not in radius_steps:
        radius_steps.append(maximum_radius)
    radius_steps.sort()
    dispatch["initial_radius_km"] = initial_radius
    dispatch["maximum_radius_km"] = maximum_radius
    dispatch["radius_steps_km"] = radius_steps
    dispatch["offer_timeout_seconds"] = int(dispatch["offer_timeout_seconds"])
    dispatch["search_timeout_seconds"] = int(dispatch["search_timeout_seconds"])
    dispatch["driver_stale_seconds"] = int(dispatch["driver_stale_seconds"])
    dispatch["dispatch_sweeper_interval_seconds"] = int(dispatch["dispatch_sweeper_interval_seconds"])
    dispatch["boarding_start_radius_meters"] = int(dispatch["boarding_start_radius_meters"])
    dispatch["expansion_radii_km"] = list(radius_steps)
    dispatch["request_timeout_seconds"] = dispatch["search_timeout_seconds"]
    dispatch["driver_stale_after_seconds"] = dispatch["driver_stale_seconds"]
    return dispatch


async def upsert_city(payload: Dict[str, Any], actor: Dict[str, Any]) -> Dict[str, Any]:
    _ = actor
    data = dict(payload)
    slug = str(data["slug"])
    existing = await database.find_one("hailing_cities", {"slug": slug})

    pricing = {
        ride_class: _pricing_from_update(data, ride_class, existing)
        for ride_class in ("ECONOMY", "COMFORT", "XL")
    }
    dispatch = _dispatch_from_update(data, existing)

    latitude = float(data.pop("latitude"))
    longitude = float(data.pop("longitude"))
    timestamp = now_iso()
    base = dict(existing or {})
    if not existing:
        base.update(
            {
                "id": f"zw-{slug}",
                "enabled": True,
                "ride_hailing_enabled": True,
                "pickup_enabled": True,
                "dropoff_enabled": True,
                "created_at": timestamp,
            }
        )
    city = {
        **base,
        "id": existing.get("id") if existing else f"zw-{slug}",
        "country": "Zimbabwe",
        "country_code": "ZW",
        "center": point(latitude, longitude),
        "location": geojson_point(latitude, longitude),
        "timezone": "Africa/Harare",
        "currency": "USD",
        "pricing": pricing,
        "pricing_version": PRICING_VERSION,
        "dispatch": dispatch,
        **data,
        "updated_at": timestamp,
    }
    if existing:
        updated = await database.update_one("hailing_cities", existing["id"], city)
        return updated or city
    return await database.insert_one("hailing_cities", city)
