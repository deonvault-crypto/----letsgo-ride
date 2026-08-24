from __future__ import annotations

import logging
from typing import Any, Dict, List

from app.database import database
from app.models.event import RealtimeAudience
from app.services.courier_delivery_realtime_service import delivery_realtime_version
from app.services.courier_state_service import ACTIVE_COURIER_STATUSES
from app.services.event_service import realtime_event_service


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


async def eligible_courier_user_ids(*, sender_user_id: str | None = None) -> set[str]:
    """Resolve offer recipients with three set-based reads, never per-Courier queries."""
    profiles = await database.find_many(
        "courier_profiles",
        {"status": "APPROVED", "online": True},
    )
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
    deliveries = await database.find_many(
        "courier_deliveries",
        {"status": "MATCHING", "courier_user_id": None, "quote_status": "READY"},
    )
    user_id = str(user.get("id") or "")
    return [
        safe_courier_offer(delivery)
        for delivery in sorted(deliveries, key=lambda item: str(item.get("created_at") or ""))
        if delivery_is_offer_eligible(delivery) and delivery.get("sender_user_id") != user_id
    ]


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
    except Exception as exc:
        logger.warning(
            "courier_offer_realtime_publish_failed delivery_id=%s version=%s error=%s",
            delivery.get("id"),
            delivery_realtime_version(delivery),
            type(exc).__name__,
        )
    return event_type
