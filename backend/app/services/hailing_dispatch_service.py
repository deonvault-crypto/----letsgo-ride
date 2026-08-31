from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from app.config import get_settings
from app.database import database
from app.services.hailing_city_service import haversine_km, point
from app.services.hailing_state import ACTIVE_DRIVER_STATUSES
from app.services.routing_service import RoutingError, compute_route_matrix
from app.utils import now_iso


logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class DispatchPolicy:
    initial_radius_km: float
    radius_steps_km: tuple[float, ...]
    maximum_radius_km: float
    offer_timeout_seconds: int
    search_timeout_seconds: int
    driver_stale_seconds: int
    dispatch_sweeper_interval_seconds: int
    boarding_start_radius_meters: int
    candidate_limit: int
    eta_rank_limit: int
    road_eta_ranking_enabled: bool

    def next_radius(self, current_radius_km: float) -> float:
        for radius in self.radius_steps_km:
            if radius > current_radius_km:
                return min(radius, self.maximum_radius_km)
        return self.maximum_radius_km


def dispatch_policy(city: Optional[Dict[str, Any]]) -> DispatchPolicy:
    dispatch = dict((city or {}).get("dispatch") or {})
    raw_steps = dispatch.get("radius_steps_km") or [2.0, 4.0, 8.0, 15.0]
    positive_steps = sorted({float(value) for value in raw_steps if float(value) > 0})
    maximum_radius = max(0.5, min(float(dispatch.get("maximum_radius_km") or 15.0), 80.0))
    initial_radius = max(0.25, min(float(dispatch.get("initial_radius_km") or 2.0), maximum_radius))
    steps = tuple(radius for radius in positive_steps if radius <= maximum_radius)
    if initial_radius not in steps:
        steps = tuple(sorted({*steps, initial_radius}))
    if maximum_radius not in steps:
        steps = tuple(sorted({*steps, maximum_radius}))

    candidate_limit = max(4, min(int(dispatch.get("candidate_limit") or 16), 40))
    eta_rank_limit = max(1, min(int(dispatch.get("eta_rank_limit") or 8), candidate_limit))
    return DispatchPolicy(
        initial_radius_km=initial_radius,
        radius_steps_km=steps,
        maximum_radius_km=maximum_radius,
        offer_timeout_seconds=max(5, min(int(dispatch.get("offer_timeout_seconds") or 25), 120)),
        search_timeout_seconds=max(30, min(int(dispatch.get("search_timeout_seconds") or 120), 600)),
        driver_stale_seconds=max(10, min(int(dispatch.get("driver_stale_seconds") or 75), 300)),
        dispatch_sweeper_interval_seconds=max(2, min(int(dispatch.get("dispatch_sweeper_interval_seconds") or 3), 30)),
        boarding_start_radius_meters=max(50, min(int(dispatch.get("boarding_start_radius_meters") or 250), 1500)),
        candidate_limit=candidate_limit,
        eta_rank_limit=eta_rank_limit,
        road_eta_ranking_enabled=bool(dispatch.get("road_eta_ranking_enabled", True)),
    )


def fresh_cutoff(seconds: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(seconds=seconds)).isoformat()


def parse_time(value: Any) -> Optional[datetime]:
    try:
        return datetime.fromisoformat(str(value))
    except (TypeError, ValueError):
        return None


def _presence_location(presence: Dict[str, Any]) -> Optional[Dict[str, float]]:
    coordinates = ((presence.get("location") or {}).get("coordinates") or [])
    if len(coordinates) != 2:
        return None
    longitude, latitude = coordinates
    if not isinstance(latitude, (int, float)) or not isinstance(longitude, (int, float)):
        return None
    return {"latitude": float(latitude), "longitude": float(longitude)}


async def _nearby_available_presence(
    trip: Dict[str, Any],
    radius_km: float,
    policy: DispatchPolicy,
) -> List[Dict[str, Any]]:
    """Find physically nearby Drivers; city labels never widen or shrink the radius."""
    pickup = trip["pickup"]
    cutoff = fresh_cutoff(policy.driver_stale_seconds)
    if database.db is not None:
        cursor = database.db["hailing_driver_presence"].find(
            {
                "ride_class": trip["ride_class"],
                "status": "available",
                "last_seen_at": {"$gte": cutoff},
                "location": {
                    "$near": {
                        "$geometry": {
                            "type": "Point",
                            "coordinates": [pickup["longitude"], pickup["latitude"]],
                        },
                        "$maxDistance": int(radius_km * 1000),
                    }
                },
            }
        ).limit(policy.candidate_limit)
        rows = [database._clean(item) async for item in cursor]
    else:
        rows = await database.find_many(
            "hailing_driver_presence",
            {
                "ride_class": trip["ride_class"],
                "status": "available",
            },
        )

    cutoff_time = parse_time(cutoff)
    nearby: List[Dict[str, Any]] = []
    pickup_point = point(pickup["latitude"], pickup["longitude"])
    for row in rows:
        seen = parse_time(row.get("last_seen_at"))
        if not seen or not cutoff_time or seen < cutoff_time:
            continue
        location = _presence_location(row)
        if not location:
            continue
        distance = haversine_km(
            pickup_point,
            point(location["latitude"], location["longitude"]),
        )
        if distance > radius_km:
            continue
        nearby.append(
            {
                **row,
                "pickup_distance_km": round(distance, 3),
                "dispatch_location": location,
            }
        )
    nearby.sort(key=lambda item: float(item["pickup_distance_km"]))
    return nearby[: policy.candidate_limit]


async def _bulk_filter_eligible(
    trip: Dict[str, Any],
    candidates: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    driver_ids = [str(item.get("driver_id") or "") for item in candidates]
    driver_ids = [driver_id for driver_id in driver_ids if driver_id]
    if not driver_ids:
        return []

    prior_offers = await database.find_many(
        "hailing_dispatch_offers",
        {"trip_id": trip["id"], "driver_id": {"$in": driver_ids}},
    )
    already_offered = {str(item.get("driver_id") or "") for item in prior_offers}

    pending_offers = await database.find_many(
        "hailing_dispatch_offers",
        {"driver_id": {"$in": driver_ids}, "status": "pending"},
    )
    busy_with_offer = {str(item.get("driver_id") or "") for item in pending_offers}

    active_trips = await database.find_many(
        "hailing_trips",
        {"driver_id": {"$in": driver_ids}, "status": {"$in": list(ACTIVE_DRIVER_STATUSES)}},
    )
    busy_with_trip = {str(item.get("driver_id") or "") for item in active_trips}

    drivers = await database.find_many("drivers", {"id": {"$in": driver_ids}})
    approved: Dict[str, Dict[str, Any]] = {}
    for driver in drivers:
        driver_id = str(driver.get("id") or "")
        if not driver_id:
            continue
        if not driver.get("verified") or driver.get("verification_status") != "approved":
            continue
        if driver.get("hailing_enabled") is not True:
            continue
        if str(driver.get("status") or "").lower() in {"suspended", "blocked"}:
            continue
        if trip.get("ride_class") not in (driver.get("approved_hailing_classes") or []):
            continue
        approved[driver_id] = driver

    return [
        candidate
        for candidate in candidates
        if candidate.get("driver_id") in approved
        and candidate.get("driver_id") not in already_offered
        and candidate.get("driver_id") not in busy_with_offer
        and candidate.get("driver_id") not in busy_with_trip
    ]


async def _rank_by_pickup_eta(
    trip: Dict[str, Any],
    candidates: List[Dict[str, Any]],
    policy: DispatchPolicy,
) -> List[Dict[str, Any]]:
    if not candidates:
        return []
    if not policy.road_eta_ranking_enabled or not get_settings().routing_configured:
        return [{**item, "ranking_method": "geo_distance"} for item in candidates]

    eta_candidates = candidates[: policy.eta_rank_limit]
    origins = [item["dispatch_location"] for item in eta_candidates]
    pickup = {
        "latitude": float(trip["pickup"]["latitude"]),
        "longitude": float(trip["pickup"]["longitude"]),
    }
    try:
        matrix = await compute_route_matrix(origins, pickup)
    except RoutingError as exc:
        logger.warning(
            "hailing_eta_ranking_fallback trip_id=%s candidate_count=%s error_type=%s",
            trip.get("id"),
            len(eta_candidates),
            exc.__class__.__name__,
        )
        return [{**item, "ranking_method": "geo_distance"} for item in candidates]

    by_origin = {int(item["origin_index"]): item for item in matrix}
    enriched: List[Dict[str, Any]] = []
    for index, candidate in enumerate(candidates):
        matrix_row = by_origin.get(index) if index < len(eta_candidates) else None
        if matrix_row:
            enriched.append(
                {
                    **candidate,
                    "pickup_eta_seconds": matrix_row["duration_seconds"],
                    "pickup_route_distance_meters": matrix_row["distance_meters"],
                    "ranking_method": "road_eta",
                }
            )
        else:
            enriched.append({**candidate, "ranking_method": "geo_distance"})

    enriched.sort(
        key=lambda item: (
            0 if isinstance(item.get("pickup_eta_seconds"), int) else 1,
            int(item.get("pickup_eta_seconds") or 0),
            float(item.get("pickup_distance_km") or 0),
        )
    )
    return enriched


async def ranked_dispatch_candidates(
    trip: Dict[str, Any],
    radius_km: float,
    policy: DispatchPolicy,
) -> List[Dict[str, Any]]:
    if not get_settings().hailing_enabled:
        return []
    nearby = await _nearby_available_presence(trip, radius_km, policy)
    eligible = await _bulk_filter_eligible(trip, nearby)
    return await _rank_by_pickup_eta(trip, eligible, policy)


async def reserve_candidate(
    candidate: Dict[str, Any],
    trip: Dict[str, Any],
    policy: DispatchPolicy,
) -> Optional[Dict[str, Any]]:
    """Atomically claim one still-fresh available presence row for this request."""
    return await database.update_one_if(
        "hailing_driver_presence",
        {
            "id": candidate["id"],
            "driver_id": candidate["driver_id"],
            "ride_class": trip["ride_class"],
            "status": "available",
            "last_seen_at": {"$gte": fresh_cutoff(policy.driver_stale_seconds)},
        },
        {
            "status": "offered",
            "offered_trip_id": trip["id"],
            "offered_at": now_iso(),
            "updated_at": now_iso(),
        },
    )


async def release_candidate_reservation(
    driver_id: str,
    trip_id: str,
    *,
    next_status: str = "available",
) -> Optional[Dict[str, Any]]:
    """Release only the reservation owned by this exact trip; never another trip's claim."""
    return await database.update_one_if(
        "hailing_driver_presence",
        {
            "driver_id": driver_id,
            "status": "offered",
            "offered_trip_id": trip_id,
        },
        {
            "status": next_status,
            "offered_trip_id": None,
            "offered_at": None,
            "updated_at": now_iso(),
        },
    )


def offer_ranking_fields(candidate: Dict[str, Any], candidate_count: int) -> Dict[str, Any]:
    route_distance_meters = candidate.get("pickup_route_distance_meters")
    eta_seconds = candidate.get("pickup_eta_seconds")
    result: Dict[str, Any] = {
        "pickup_distance_km": candidate.get("pickup_distance_km"),
        "ranking_method": candidate.get("ranking_method") or "geo_distance",
        "candidate_count": candidate_count,
    }
    if isinstance(route_distance_meters, (int, float)):
        result["pickup_route_distance_km"] = round(float(route_distance_meters) / 1000.0, 3)
    if isinstance(eta_seconds, int):
        result["pickup_eta_seconds"] = eta_seconds
        result["pickup_eta_minutes"] = max(1, int(round(eta_seconds / 60.0)))
    return result
