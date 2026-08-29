from __future__ import annotations

import math
from typing import Any, Dict, Iterable, List, Optional

from app.config import get_settings
from app.database import database
from app.utils import now_iso


DEFAULT_CITY_PRICING = {
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
    pricing = city.get("pricing") or {}
    return [
        ride_class
        for ride_class in ("ECONOMY", "COMFORT", "XL")
        if bool((pricing.get(ride_class) or {}).get("enabled"))
    ]


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
        "dispatch": dict(DEFAULT_DISPATCH_SETTINGS),
        "created_at": timestamp,
        "updated_at": timestamp,
    }


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
            await database.update_one("hailing_cities", existing["id"], {**updates, "updated_at": now_iso()})
            continue
        await database.insert_one("hailing_cities", desired)


async def list_service_areas(include_disabled: bool = False) -> List[Dict[str, Any]]:
    cities = await database.find_many("hailing_cities")
    if not cities:
        await seed_zimbabwe_service_areas()
        cities = await database.find_many("hailing_cities")
    if not include_disabled:
        cities = [city for city in cities if city.get("enabled")]
    return sorted(cities, key=lambda item: item.get("name") or "")


async def get_city(city_id: str) -> Optional[Dict[str, Any]]:
    return await database.find_one("hailing_cities", {"id": city_id}) or await database.find_one("hailing_cities", {"slug": city_id})


async def resolve_service_area(latitude: float, longitude: float) -> Dict[str, Any]:
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
    within_radius = distance <= float(city.get("service_radius_km") or 0)
    enabled = bool(settings.hailing_enabled and within_radius and city.get("enabled") and city.get("ride_hailing_enabled"))
    classes = enabled_ride_classes(city) if enabled else []
    return {
        "supported": bool(within_radius),
        "enabled": enabled,
        "reason": "enabled" if enabled else ("outside_service_radius" if not within_radius else "disabled"),
        "distance_to_center_km": round(distance, 3),
        "service_area": public_city(city),
        "ride_classes": classes,
    }


async def upsert_city(payload: Dict[str, Any], actor: Dict[str, Any]) -> Dict[str, Any]:
    pricing = {key: dict(value) for key, value in DEFAULT_CITY_PRICING.items()}
    pricing["ECONOMY"]["enabled"] = bool(payload.pop("economy_enabled", True))
    pricing["COMFORT"]["enabled"] = bool(payload.pop("comfort_enabled", False))
    pricing["XL"]["enabled"] = bool(payload.pop("xl_enabled", False))
    pricing["ECONOMY"]["surge_multiplier"] = float(payload.pop("economy_surge_multiplier", 1.0))
    pricing["COMFORT"]["surge_multiplier"] = float(payload.pop("comfort_surge_multiplier", 1.0))
    pricing["XL"]["surge_multiplier"] = float(payload.pop("xl_surge_multiplier", 1.0))
    initial_radius = float(payload.pop("initial_radius_km", DEFAULT_DISPATCH_SETTINGS["initial_radius_km"]))
    maximum_radius = float(payload.pop("maximum_radius_km", DEFAULT_DISPATCH_SETTINGS["maximum_radius_km"]))
    radius_steps = [radius for radius in DEFAULT_DISPATCH_SETTINGS["radius_steps_km"] if float(radius) <= maximum_radius]
    if initial_radius not in radius_steps:
        radius_steps = sorted({initial_radius, *radius_steps})
    dispatch = {
        **DEFAULT_DISPATCH_SETTINGS,
        "initial_radius_km": initial_radius,
        "radius_steps_km": radius_steps,
        "maximum_radius_km": maximum_radius,
        "offer_timeout_seconds": int(payload.pop("offer_timeout_seconds", DEFAULT_DISPATCH_SETTINGS["offer_timeout_seconds"])),
        "search_timeout_seconds": int(payload.pop("search_timeout_seconds", DEFAULT_DISPATCH_SETTINGS["search_timeout_seconds"])),
        "driver_stale_seconds": int(payload.pop("driver_stale_seconds", DEFAULT_DISPATCH_SETTINGS["driver_stale_seconds"])),
        "dispatch_sweeper_interval_seconds": int(payload.pop("dispatch_sweeper_interval_seconds", DEFAULT_DISPATCH_SETTINGS["dispatch_sweeper_interval_seconds"])),
        "boarding_start_radius_meters": int(payload.pop("boarding_start_radius_meters", DEFAULT_DISPATCH_SETTINGS["boarding_start_radius_meters"])),
    }
    dispatch["expansion_radii_km"] = list(dispatch["radius_steps_km"])
    dispatch["request_timeout_seconds"] = dispatch["search_timeout_seconds"]
    dispatch["driver_stale_after_seconds"] = dispatch["driver_stale_seconds"]
    timestamp = now_iso()
    city = {
        "id": f"zw-{payload['slug']}",
        "country": "Zimbabwe",
        "country_code": "ZW",
        "center": point(payload.pop("latitude"), payload.pop("longitude")),
        "timezone": "Africa/Harare",
        "currency": "USD",
        "pricing": pricing,
        "dispatch": dispatch,
        **payload,
        "updated_at": timestamp,
    }
    city["location"] = geojson_point(city["center"]["latitude"], city["center"]["longitude"])
    existing = await database.find_one("hailing_cities", {"slug": city["slug"]})
    if existing:
        updated = await database.update_one("hailing_cities", existing["id"], city)
        return updated or {**existing, **city}
    city["created_at"] = timestamp
    return await database.insert_one("hailing_cities", city)
