from __future__ import annotations

import logging
import math
from typing import Any, Dict, List

from app.database import database
from app.models.event import RealtimeAudience
from app.services.courier_delivery_realtime_service import delivery_realtime_version
from app.services.courier_presence_service import (
    COURIER_GEO_CANDIDATE_LIMIT,
    COURIER_OFFER_RADIUS_METERS,
    courier_presence_cutoff,
)
from app.services.courier_state_service import ACTIVE_COURIER_STATUSES
from app.services.event_service import realtime_event_service
from app.services.notification_service import notify_users


logger = logging.getLogger(__name__)


def delivery_is_offer_eligible(delivery: Dict[str, Any] | None) -> bool:
    if not delivery:
        return False
    return bool(
        delivery.get("status") == "MATCHING"
        and delivery.get("courier_user_id") in {None, ""}
        and delivery.get("quote_status") == "READY"
        and isinstance(delivery.get("price_usd"), (int, float))
        and not isinstance(delivery.get("price_usd"), bool)
        and float(delivery.get("price_usd") or 0) > 0
        and isinstance(delivery.get("courier_payout_usd"), (int, float))
        and not isinstance(delivery.get("courier_payout_usd"), bool)
        and float(delivery.get("courier_payout_usd") or 0) > 0
    )


def safe_courier_offer(delivery: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": delivery.get("id"),
        "realtime_version": delivery_realtime_version(delivery),
        "source_type": delivery.get("source_type") or "COURIER_REQUEST",
        "status": delivery.get("status"),
        "quote_status": delivery.get("quote_status"),
        "pickup_address": delivery.get("pickup_address"),
        "dropoff_address": delivery.get("dropoff_address"),
        "pickup_location": delivery.get("pickup_location"),
        "dropoff_location": delivery.get("dropoff_location"),
        "currency": delivery.get("currency") or "USD",
        "price_usd": delivery.get("price_usd"),
        "courier_payout_usd": delivery.get("courier_payout_usd"),
        "distance_km": delivery.get("distance_km"),
        "estimated_duration_minutes": delivery.get("estimated_duration_minutes"),
        "route_polyline": delivery.get("route_polyline"),
        "created_at": delivery.get("created_at"),
        "updated_at": delivery.get("updated_at"),
    }


def _lat_lon(location: Any) -> tuple[float, float] | None:
    if not isinstance(location, dict):
        return None
    if location.get("type") == "Point":
        coordinates = location.get("coordinates") or []
        if len(coordinates) != 2:
            return None
        longitude, latitude = coordinates
    else:
        latitude = location.get("latitude")
        longitude = location.get("longitude")
    if not isinstance(latitude, (int, float)) or not isinstance(longitude, (int, float)):
        return None
    return float(latitude), float(longitude)


def _distance_meters(a: Any, b: Any) -> float | None:
    first = _lat_lon(a)
    second = _lat_lon(b)
    if not first or not second:
        return None
    lat1, lon1 = first
    lat2, lon2 = second
    radians = math.pi / 180.0
    p1 = lat1 * radians
    p2 = lat2 * radians
    dlat = (lat2 - lat1) * radians
    dlon = (lon2 - lon1) * radians
    h = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    return 6_371_000 * 2 * math.atan2(math.sqrt(h), math.sqrt(max(0.0, 1 - h)))


def _legacy_presence(profile: Dict[str, Any]) -> bool:
    """Build 35 and older profiles predate Courier presence; keep a bounded migration lane."""
    return not profile.get("last_seen_at") and not _lat_lon(profile.get("location"))


async def _nearby_online_profiles(pickup_location: Dict[str, Any] | None) -> List[Dict[str, Any]]:
    pickup = _lat_lon(pickup_location)
    cutoff = courier_presence_cutoff()

    if database.db is not None and pickup:
        latitude, longitude = pickup
        cursor = database.db["courier_profiles"].find(
            {
                "status": "APPROVED",
                "online": True,
                "last_seen_at": {"$gte": cutoff},
                "location": {
                    "$near": {
                        "$geometry": {"type": "Point", "coordinates": [longitude, latitude]},
                        "$maxDistance": COURIER_OFFER_RADIUS_METERS,
                    }
                },
            }
        ).limit(COURIER_GEO_CANDIDATE_LIMIT)
        nearby = [database._clean(item) async for item in cursor]
        if len(nearby) >= COURIER_GEO_CANDIDATE_LIMIT:
            return nearby
        legacy = await database.find_many(
            "courier_profiles",
            {
                "status": "APPROVED",
                "online": True,
                "last_seen_at": {"$in": [None, ""]},
            },
            limit=COURIER_GEO_CANDIDATE_LIMIT,
        )
        seen = {str(item.get("user_id") or "") for item in nearby}
        nearby.extend(
            item for item in legacy
            if _legacy_presence(item) and str(item.get("user_id") or "") not in seen
        )
        return nearby[:COURIER_GEO_CANDIDATE_LIMIT]

    profiles = await database.find_many(
        "courier_profiles",
        {"status": "APPROVED", "online": True},
        limit=COURIER_GEO_CANDIDATE_LIMIT * 3,
    )
    if not pickup:
        return profiles[:COURIER_GEO_CANDIDATE_LIMIT]

    nearby: List[tuple[float, Dict[str, Any]]] = []
    legacy: List[Dict[str, Any]] = []
    for profile in profiles:
        if _legacy_presence(profile):
            legacy.append(profile)
            continue
        if str(profile.get("last_seen_at") or "") < cutoff:
            continue
        distance = _distance_meters(profile.get("location"), pickup_location)
        if distance is None or distance > COURIER_OFFER_RADIUS_METERS:
            continue
        nearby.append((distance, profile))
    nearby.sort(key=lambda item: item[0])
    result = [profile for _, profile in nearby]
    result.extend(legacy[: max(0, COURIER_GEO_CANDIDATE_LIMIT - len(result))])
    return result[:COURIER_GEO_CANDIDATE_LIMIT]


async def eligible_courier_user_ids(
    *,
    pickup_location: Dict[str, Any] | None = None,
    sender_user_id: str | None = None,
) -> set[str]:
    """Resolve nearby/fresh Couriers while preserving a bounded pre-presence migration lane."""
    profiles = await _nearby_online_profiles(pickup_location)
    profile_user_ids = {
        str(profile.get("user_id") or "")
        for profile in profiles
        if profile.get("user_id")
    }
    if not profile_user_ids:
        return set()
    users = await database.find_many(
        "users",
        {"id": {"$in": sorted(profile_user_ids)}, "role": "courier"},
    )
    courier_user_ids = {str(user.get("id") or "") for user in users if user.get("id")}
    if not courier_user_ids:
        return set()
    active = await database.find_many(
        "courier_deliveries",
        {
            "courier_user_id": {"$in": sorted(courier_user_ids)},
            "status": {"$in": sorted(ACTIVE_COURIER_STATUSES)},
        },
    )
    active_user_ids = {str(delivery.get("courier_user_id") or "") for delivery in active}
    recipients = courier_user_ids - active_user_ids
    if sender_user_id:
        recipients.discard(str(sender_user_id))
    return recipients


async def list_offer_deliveries_for_courier(
    user: Dict[str, Any],
    *,
    profile: Dict[str, Any] | None,
    has_active_delivery: bool,
) -> List[Dict[str, Any]]:
    if not profile or profile.get("status") != "APPROVED":
        raise PermissionError("Approved courier verification is required to view delivery offers.")
    if user.get("role") != "courier" or not profile.get("online") or has_active_delivery:
        return []

    profile_location = _lat_lon(profile.get("location"))
    legacy_profile = _legacy_presence(profile)
    if not legacy_profile and (not profile_location or str(profile.get("last_seen_at") or "") < courier_presence_cutoff()):
        return []

    deliveries = await database.find_many(
        "courier_deliveries",
        {"status": "MATCHING", "courier_user_id": None, "quote_status": "READY"},
        sort=[("created_at", 1)],
        limit=120,
    )
    user_id = str(user.get("id") or "")
    eligible = [
        delivery for delivery in deliveries
        if delivery_is_offer_eligible(delivery) and delivery.get("sender_user_id") != user_id
    ]
    if legacy_profile:
        return [safe_courier_offer(delivery) for delivery in eligible[:COURIER_GEO_CANDIDATE_LIMIT]]

    nearby: List[tuple[float, Dict[str, Any]]] = []
    for delivery in eligible:
        distance = _distance_meters(profile.get("location"), delivery.get("pickup_location"))
        if distance is None or distance > COURIER_OFFER_RADIUS_METERS:
            continue
        nearby.append((distance, delivery))
    nearby.sort(key=lambda item: (item[0], str(item[1].get("created_at") or "")))
    return [safe_courier_offer(delivery) for _, delivery in nearby[:COURIER_GEO_CANDIDATE_LIMIT]]


def _offer_visible_state(delivery: Dict[str, Any]) -> Dict[str, Any]:
    payload = safe_courier_offer(delivery)
    payload.pop("realtime_version", None)
    payload.pop("updated_at", None)
    return payload


async def publish_courier_offer_transition(
    before: Dict[str, Any] | None,
    after: Dict[str, Any] | None,
) -> str | None:
    before_eligible = delivery_is_offer_eligible(before)
    after_eligible = delivery_is_offer_eligible(after)
    if not before_eligible and not after_eligible:
        return None
    if not before_eligible and after_eligible:
        event_type = "courier_offer.available"
    elif before_eligible and not after_eligible:
        event_type = "courier_offer.removed"
    elif before and after and _offer_visible_state(before) != _offer_visible_state(after):
        event_type = "courier_offer.updated"
    else:
        return None

    delivery = after or before
    if not delivery:
        return None
    try:
        recipients = await eligible_courier_user_ids(
            pickup_location=delivery.get("pickup_location"),
            sender_user_id=str(delivery.get("sender_user_id") or "") or None,
        )
        if not recipients:
            return event_type
        payload = {
            "id": delivery.get("id"),
            "realtime_version": delivery_realtime_version(delivery),
        }
        if event_type != "courier_offer.removed":
            payload.update(safe_courier_offer(delivery))
        published = await realtime_event_service.publish(
            realtime_event_service.build_event(
                event_type=event_type,
                resource_type="courier_offer",
                resource_id=str(delivery.get("id") or ""),
                version=delivery_realtime_version(delivery),
                audience=RealtimeAudience(user_ids=frozenset(recipients)),
                payload=payload,
            )
        )
        if not published:
            logger.warning(
                "courier_offer_realtime_unavailable delivery_id=%s version=%s",
                delivery.get("id"),
                delivery_realtime_version(delivery),
            )
        if event_type == "courier_offer.available":
            await notify_users(
                sorted(recipients),
                "trip_updates",
                "New delivery request",
                "A nearby delivery is ready. Open LetsGoRide to review the route and earnings.",
                {
                    "notification_target": "courier_offer",
                    "courier_offer_id": delivery.get("id"),
                    "delivery_id": delivery.get("id"),
                },
            )
    except Exception as exc:
        logger.warning(
            "courier_offer_realtime_publish_failed delivery_id=%s version=%s error=%s",
            delivery.get("id"),
            delivery_realtime_version(delivery),
            type(exc).__name__,
        )
    return event_type
