from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Dict, List
from urllib.parse import quote

import requests

from app.config import get_settings


logger = logging.getLogger(__name__)

GOOGLE_GEOCODE_URL = "https://geocode.googleapis.com/v4/geocode/address/{address}"
GOOGLE_REVERSE_GEOCODE_URL = "https://geocode.googleapis.com/v4/geocode/location/{latitude},{longitude}"
GOOGLE_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"
GOOGLE_PLACES_AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete"
GOOGLE_PLACE_DETAILS_URL = "https://places.googleapis.com/v1/places/{place_id}"

_AUTOCOMPLETE_CACHE_TTL_SECONDS = 15 * 60
_autocomplete_cache: Dict[str, tuple[float, List[Dict[str, Any]]]] = {}
_ZIMBABWE_DISCOVERY = [
    ("Harare", "Harare, Zimbabwe", -17.824858, 31.053028),
    ("Bulawayo", "Bulawayo, Zimbabwe", -20.149812, 28.585388),
    ("Mutare", "Mutare, Zimbabwe", -18.9707, 32.6709),
    ("Gweru", "Gweru, Zimbabwe", -19.4513, 29.8152),
    ("Masvingo", "Masvingo, Zimbabwe", -20.0744, 30.8328),
    ("Victoria Falls", "Victoria Falls, Zimbabwe", -17.9243, 25.8560),
    ("Joina City", "Joina City, Jason Moyo Avenue, Harare, Zimbabwe", -17.8313, 31.0477),
    ("Sam Levy’s Village", "Sam Levy’s Village, Borrowdale, Harare, Zimbabwe", -17.7622, 31.0902),
    ("Robert Gabriel Mugabe International Airport", "Harare Airport, Zimbabwe", -17.9318, 31.0928),
    ("Joshua Mqabuko Nkomo International Airport", "Bulawayo Airport, Zimbabwe", -20.0174, 28.6179),
]


class RoutingError(RuntimeError):
    pass


class RoutingNotConfiguredError(RoutingError):
    pass


class RoutingNoResultError(RoutingError):
    pass


def _curated_suggestions(query: str) -> List[Dict[str, Any]]:
    clean = " ".join(query.strip().lower().split())
    if len(clean) < 2:
        return []
    matches = []
    for name, address, latitude, longitude in _ZIMBABWE_DISCOVERY:
        if clean not in name.lower() and clean not in address.lower():
            continue
        matches.append({
            "provider": "letsgoride_zw",
            "place_id": f"zw:{name.lower().replace(' ', '-')}",
            "primary_text": name,
            "secondary_text": address,
            "description": address,
            "location": {"latitude": latitude, "longitude": longitude},
        })
    return matches[:8]


def _cached_suggestions(query: str) -> List[Dict[str, Any]] | None:
    cached = _autocomplete_cache.get(query)
    if not cached or time.monotonic() - cached[0] > _AUTOCOMPLETE_CACHE_TTL_SECONDS:
        _autocomplete_cache.pop(query, None)
        return None
    return [dict(item) for item in cached[1]]


def _remember_suggestions(query: str, results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if results:
        _autocomplete_cache[query] = (time.monotonic(), [dict(item) for item in results])
        if len(_autocomplete_cache) > 200:
            oldest = min(_autocomplete_cache, key=lambda key: _autocomplete_cache[key][0])
            _autocomplete_cache.pop(oldest, None)
    return results


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


def _provider_error_details(response: requests.Response) -> tuple[str, str]:
    """Return safe structured Google error fields without logging credentials or request data."""
    try:
        payload = response.json()
    except ValueError:
        return "unknown", "non_json_response"
    if not isinstance(payload, dict):
        return "unknown", "invalid_error_payload"
    error = payload.get("error")
    if not isinstance(error, dict):
        return "unknown", "provider_error"
    status = str(error.get("status") or "unknown")[:80]
    message = " ".join(str(error.get("message") or "provider_error").split())[:300]
    return status, message


def _request_json(method: str, url: str, **kwargs: Any) -> Dict[str, Any]:
    response = requests.request(method, url, **kwargs)
    try:
        response.raise_for_status()
    except requests.RequestException as exc:
        provider_status, provider_message = _provider_error_details(response)
        logger.warning(
            "routing_provider_request_failed provider=google http_status=%s provider_status=%s message=%r",
            response.status_code,
            provider_status,
            provider_message,
        )
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


async def reverse_geocode_location(location: Dict[str, float]) -> Dict[str, Any]:
    api_key, region_code, timeout = _google_config()
    latitude = float(location["latitude"])
    longitude = float(location["longitude"])
    url = GOOGLE_REVERSE_GEOCODE_URL.format(latitude=latitude, longitude=longitude)
    headers = {
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": "results.location,results.formattedAddress,results.placeId",
    }
    payload = await asyncio.to_thread(
        _request_json,
        "GET",
        url,
        headers=headers,
        params={"regionCode": region_code},
        timeout=timeout,
    )
    results = payload.get("results") or []
    if not results:
        raise RoutingNoResultError("No nearby address was found for that map position.")
    first = results[0] if isinstance(results[0], dict) else {}
    return {
        "provider": "google",
        "formatted_address": first.get("formattedAddress") or "Pinned location",
        "place_id": first.get("placeId"),
        "location": {"latitude": latitude, "longitude": longitude},
    }


async def autocomplete_places(query: str) -> List[Dict[str, Any]]:
    """Return customer-friendly place suggestions without exposing the Google key to mobile."""
    clean_query = " ".join(query.strip().split())
    if len(clean_query) < 2:
        return []
    cache_key = clean_query.lower()
    cached = _cached_suggestions(cache_key)
    if cached is not None:
        return cached
    curated = _curated_suggestions(clean_query)
    try:
        api_key, region_code, timeout = _google_config()
    except RoutingNotConfiguredError:
        return _remember_suggestions(cache_key, curated)

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": (
            "suggestions.placePrediction.placeId,"
            "suggestions.placePrediction.text.text,"
            "suggestions.placePrediction.structuredFormat.mainText.text,"
            "suggestions.placePrediction.structuredFormat.secondaryText.text"
        ),
    }
    body = {
        "input": clean_query,
        "regionCode": region_code,
        "includedRegionCodes": [region_code.lower()],
    }

    try:
        payload = await asyncio.to_thread(
            _request_json,
            "POST",
            GOOGLE_PLACES_AUTOCOMPLETE_URL,
            headers=headers,
            json=body,
            timeout=timeout,
        )
    except RoutingError:
        # Some existing Maps projects may have Geocoding + Routes enabled before
        # Places (New) is enabled. Keep address entry usable with one exact result.
        try:
            result = await geocode_address(clean_query)
        except RoutingError:
            return _remember_suggestions(cache_key, curated)
        return _remember_suggestions(cache_key, [
            {
                "provider": "google_geocode_fallback",
                "place_id": result.get("place_id"),
                "primary_text": result.get("formatted_address") or clean_query,
                "secondary_text": "",
                "description": result.get("formatted_address") or clean_query,
                "location": result.get("location"),
            }
        ] + curated)

    suggestions = payload.get("suggestions") or []
    results: List[Dict[str, Any]] = []
    for item in suggestions[:8]:
        if not isinstance(item, dict):
            continue
        prediction = item.get("placePrediction")
        if not isinstance(prediction, dict):
            continue
        place_id = prediction.get("placeId")
        text = prediction.get("text") or {}
        structured = prediction.get("structuredFormat") or {}
        main_text = (structured.get("mainText") or {}).get("text") if isinstance(structured, dict) else None
        secondary_text = (structured.get("secondaryText") or {}).get("text") if isinstance(structured, dict) else None
        description = text.get("text") if isinstance(text, dict) else None
        if not place_id or not description:
            continue
        results.append(
            {
                "provider": "google_places",
                "place_id": str(place_id),
                "primary_text": str(main_text or description),
                "secondary_text": str(secondary_text or ""),
                "description": str(description),
                "location": None,
            }
        )

    if results:
        return _remember_suggestions(cache_key, results + [item for item in curated if item["description"] not in {result["description"] for result in results}])

    try:
        fallback = await geocode_address(clean_query)
    except RoutingNoResultError:
        return _remember_suggestions(cache_key, curated)
    return _remember_suggestions(cache_key, [
        {
            "provider": "google_geocode_fallback",
            "place_id": fallback.get("place_id"),
            "primary_text": fallback.get("formatted_address") or clean_query,
            "secondary_text": "",
            "description": fallback.get("formatted_address") or clean_query,
            "location": fallback.get("location"),
        }
    ] + curated)


async def resolve_place(place_id: str) -> Dict[str, Any]:
    api_key, _, timeout = _google_config()
    clean_place_id = place_id.strip()
    if not clean_place_id:
        raise RoutingNoResultError("Place is required.")

    url = GOOGLE_PLACE_DETAILS_URL.format(place_id=quote(clean_place_id, safe=""))
    headers = {
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": "id,displayName,formattedAddress,location",
    }
    payload = await asyncio.to_thread(
        _request_json,
        "GET",
        url,
        headers=headers,
        timeout=timeout,
    )
    location = payload.get("location") or {}
    latitude = location.get("latitude")
    longitude = location.get("longitude")
    if not isinstance(latitude, (int, float)) or not isinstance(longitude, (int, float)):
        raise RoutingNoResultError("That place does not have usable map coordinates.")
    display_name = payload.get("displayName") or {}
    label = display_name.get("text") if isinstance(display_name, dict) else None
    formatted_address = payload.get("formattedAddress") or label or "Selected location"
    return {
        "provider": "google_places",
        "place_id": payload.get("id") or clean_place_id,
        "formatted_address": formatted_address,
        "display_name": label or formatted_address,
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
