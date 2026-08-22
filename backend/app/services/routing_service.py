from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict
from urllib.parse import quote

import requests

from app.config import get_settings


logger = logging.getLogger(__name__)

GOOGLE_GEOCODE_URL = "https://geocode.googleapis.com/v4/geocode/address/{address}"
GOOGLE_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"


class RoutingError(RuntimeError):
    pass


class RoutingNotConfiguredError(RoutingError):
    pass


class RoutingNoResultError(RoutingError):
    pass


def routing_status() -> Dict[str, Any]:
    settings = get_settings()
    return {
        "provider": settings.routing_provider,
        "configured": settings.routing_configured,
        "region_code": settings.routing_region_code,
    }


def _google_config() -> tuple[str, str, float]:
    settings = get_settings()
    if settings.routing_provider != "google":
        raise RoutingNotConfiguredError("Routing provider is not enabled.")
    if not settings.google_maps_api_key:
        raise RoutingNotConfiguredError("Google Maps routing credentials are not configured.")
    return settings.google_maps_api_key, settings.routing_region_code, settings.routing_timeout_seconds


def _request_json(method: str, url: str, **kwargs: Any) -> Dict[str, Any]:
    response = requests.request(method, url, **kwargs)
    try:
        response.raise_for_status()
    except requests.RequestException as exc:
        logger.warning("routing_provider_request_failed provider=google status=%s", response.status_code)
        raise RoutingError("Routing provider request failed.") from exc
    try:
        payload = response.json()
    except ValueError as exc:
        raise RoutingError("Routing provider returned an invalid response.") from exc
    if not isinstance(payload, dict):
        raise RoutingError("Routing provider returned an invalid response.")
    return payload


async def geocode_address(address: str) -> Dict[str, Any]:
    api_key, region_code, timeout = _google_config()
    clean_address = address.strip()
    if not clean_address:
        raise RoutingNoResultError("Address is required.")

    url = GOOGLE_GEOCODE_URL.format(address=quote(clean_address, safe=""))
    headers = {
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": "results.location,results.formattedAddress,results.placeId",
    }
    params = {"regionCode": region_code}
    payload = await asyncio.to_thread(
        _request_json,
        "GET",
        url,
        headers=headers,
        params=params,
        timeout=timeout,
    )
    results = payload.get("results") or []
    if not results:
        raise RoutingNoResultError("No location was found for that address.")

    first = results[0] if isinstance(results[0], dict) else {}
    location = first.get("location") or {}
    latitude = location.get("latitude")
    longitude = location.get("longitude")
    if not isinstance(latitude, (int, float)) or not isinstance(longitude, (int, float)):
        raise RoutingNoResultError("The routing provider did not return coordinates for that address.")

    return {
        "provider": "google",
        "formatted_address": first.get("formattedAddress") or clean_address,
        "place_id": first.get("placeId"),
        "location": {
            "latitude": float(latitude),
            "longitude": float(longitude),
        },
    }


def _parse_duration_seconds(raw: Any) -> int:
    if not isinstance(raw, str) or not raw.endswith("s"):
        raise RoutingError("Routing provider did not return a valid duration.")
    try:
        return max(0, int(round(float(raw[:-1]))))
    except ValueError as exc:
        raise RoutingError("Routing provider did not return a valid duration.") from exc


async def compute_route(
    origin: Dict[str, float],
    destination: Dict[str, float],
    *,
    include_polyline: bool = True,
) -> Dict[str, Any]:
    api_key, region_code, timeout = _google_config()

    field_mask = ["routes.distanceMeters", "routes.duration"]
    if include_polyline:
        field_mask.append("routes.polyline.encodedPolyline")

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": ",".join(field_mask),
    }
    body = {
        "origin": {"location": {"latLng": origin}},
        "destination": {"location": {"latLng": destination}},
        "travelMode": "DRIVE",
        "routingPreference": "TRAFFIC_UNAWARE",
        "computeAlternativeRoutes": False,
        "regionCode": region_code,
        "units": "METRIC",
    }
    payload = await asyncio.to_thread(
        _request_json,
        "POST",
        GOOGLE_ROUTES_URL,
        headers=headers,
        json=body,
        timeout=timeout,
    )
    routes = payload.get("routes") or []
    if not routes:
        raise RoutingNoResultError("No drivable route was found between those locations.")

    route = routes[0] if isinstance(routes[0], dict) else {}
    distance_meters = route.get("distanceMeters")
    if not isinstance(distance_meters, (int, float)):
        raise RoutingError("Routing provider did not return a valid distance.")
    duration_seconds = _parse_duration_seconds(route.get("duration"))

    encoded_polyline = None
    if include_polyline:
        polyline = route.get("polyline") or {}
        if isinstance(polyline, dict):
            encoded_polyline = polyline.get("encodedPolyline")

    return {
        "provider": "google",
        "distance_meters": int(round(float(distance_meters))),
        "distance_km": round(float(distance_meters) / 1000.0, 3),
        "duration_seconds": duration_seconds,
        "estimated_duration_minutes": max(1, int(round(duration_seconds / 60.0))),
        "encoded_polyline": encoded_polyline,
        "origin": {
            "latitude": float(origin["latitude"]),
            "longitude": float(origin["longitude"]),
        },
        "destination": {
            "latitude": float(destination["latitude"]),
            "longitude": float(destination["longitude"]),
        },
    }


async def resolve_route(
    origin_address: str,
    destination_address: str,
    *,
    origin: Dict[str, float] | None = None,
    destination: Dict[str, float] | None = None,
    include_polyline: bool = True,
) -> Dict[str, Any]:
    origin_result = None
    destination_result = None

    if origin is None:
        origin_result = await geocode_address(origin_address)
        origin = origin_result["location"]
    if destination is None:
        destination_result = await geocode_address(destination_address)
        destination = destination_result["location"]

    route = await compute_route(origin, destination, include_polyline=include_polyline)
    route["origin_address"] = (
        origin_result.get("formatted_address") if origin_result else origin_address.strip()
    )
    route["destination_address"] = (
        destination_result.get("formatted_address") if destination_result else destination_address.strip()
    )
    route["origin_place_id"] = origin_result.get("place_id") if origin_result else None
    route["destination_place_id"] = destination_result.get("place_id") if destination_result else None
    return route
