from __future__ import annotations

import asyncio
import logging
import secrets
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from app.config import get_settings
from app.database import database
from app.services.audit_service import write_audit_log
from app.services.auth_service import create_code_record, code_matches
from app.services.hailing_city_service import get_city, haversine_km, point
from app.services.hailing_dispatch_service import (
    dispatch_policy,
    offer_ranking_fields,
    ranked_dispatch_candidates,
    release_candidate_reservation,
    reserve_candidate,
)
from app.services.hailing_fare_service import quote_expired
from app.services.hailing_realtime_service import (
    publish_hailing_admin_realtime,
    publish_hailing_driver_offer_realtime,
    publish_hailing_trip_realtime,
    update_versioned_hailing_trip,
)
from app.services.hailing_state import ACTIVE_DRIVER_STATUSES, ACTIVE_PASSENGER_STATUSES, FINAL_STATUSES, TRANSITIONS
from app.services.notification_service import create_app_notification, notify_admins
from app.utils import new_id, now_iso


logger = logging.getLogger(__name__)
DISPATCH_SWEEP_BATCH_SIZE = 50
EXPIRED_OFFER_SWEEP_BATCH_SIZE = 100


def _hailing_enabled() -> bool:
    return bool(get_settings().hailing_enabled)


def _require_hailing_enabled() -> None:
    if not _hailing_enabled():
        raise PermissionError("Ride Now is not available yet.")


def parse_time(value: Any) -> Optional[datetime]:
    try:
        return datetime.fromisoformat(str(value))
    except (TypeError, ValueError):
        return None


def _new_trip_pin_record() -> tuple[str, Dict[str, Any]]:
    pin = f"{secrets.randbelow(1_000_000):06d}"
    return pin, {
        **create_code_record(pin, "trip_pin"),
        "trip_pin_attempts": 0,
        "trip_pin_generated_at": now_iso(),
        "trip_pin_verified_at": None,
        # Explicitly erase any legacy plaintext value if one exists.
        "plain_trip_pin": None,
    }


def public_trip(trip: Dict[str, Any], viewer: Dict[str, Any]) -> Dict[str, Any]:
    is_driver = trip.get("driver_user_id") == viewer.get("id")
    is_passenger = trip.get("passenger_user_id") == viewer.get("id")
    is_admin = viewer.get("role") == "admin"
    result = {
        "id": trip.get("id"),
        "status": trip.get("status"),
        "city_id": trip.get("city_id"),
        "ride_class": trip.get("ride_class"),
        "pickup": trip.get("pickup"),
        "dropoff": trip.get("dropoff"),
        "route": trip.get("route"),
        "fare": trip.get("fare"),
        "payment_method": trip.get("payment_method"),
        "payment_status": trip.get("payment_status"),
        "driver": trip.get("driver_snapshot") if is_passenger or is_admin else None,
        "vehicle": trip.get("vehicle_snapshot") if is_passenger or is_admin else None,
        "passenger": trip.get("passenger_snapshot") if is_driver or is_admin else None,
        "driver_location": trip.get("driver_location") if trip.get("status") in ACTIVE_DRIVER_STATUSES and (is_passenger or is_driver or is_admin) else None,
        "verify_ride_with_pin": bool(trip.get("verify_ride_with_pin")),
        "trip_pin_verified_at": trip.get("trip_pin_verified_at") if is_passenger or is_driver or is_admin else None,
        "search_expires_at": trip.get("search_expires_at"),
        "created_at": trip.get("created_at"),
        "updated_at": trip.get("updated_at"),
        "assigned_at": trip.get("assigned_at"),
        "arrived_at": trip.get("arrived_at"),
        "started_at": trip.get("started_at"),
        "completed_at": trip.get("completed_at"),
        "cancelled_at": trip.get("cancelled_at"),
    }
    return {key: value for key, value in result.items() if value is not None}


async def get_authorized_trip(trip_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    trip = await database.find_one("hailing_trips", {"id": trip_id})
    if not trip:
        raise ValueError("Ride Now trip not found.")
    if user.get("role") == "admin" or trip.get("passenger_user_id") == user.get("id") or trip.get("driver_user_id") == user.get("id"):
        return trip
    raise PermissionError("You can only access Ride Now trips connected to your account.")


async def active_trip_for_user(user: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if user.get("role") == "driver":
        trips = await database.find_many("hailing_trips", {"driver_user_id": user["id"], "status": {"$in": list(ACTIVE_DRIVER_STATUSES)}})
    else:
        trips = await database.find_many("hailing_trips", {"passenger_user_id": user["id"], "status": {"$in": list(ACTIVE_PASSENGER_STATUSES)}})
    return sorted(trips, key=lambda item: item.get("created_at") or "", reverse=True)[0] if trips else None


async def transition_trip(trip: Dict[str, Any], next_status: str, updates: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    current = str(trip.get("status") or "")
    if next_status not in TRANSITIONS.get(current, frozenset()):
        raise ValueError(f"Ride Now trip cannot move from {current} to {next_status}.")
    timestamp = now_iso()
    updated = await update_versioned_hailing_trip(
        {"id": trip["id"], "status": current},
        {"status": next_status, "updated_at": timestamp, **(updates or {})},
    )
    if not updated:
        raise ValueError("Ride Now trip changed while it was being updated. Refresh and try again.")
    await record_trip_event(updated, f"hailing_trip_{next_status.lower()}", {})
    await publish_hailing_trip_realtime(updated, f"hailing.trip.{next_status.lower()}")
    if next_status in FINAL_STATUSES:
        await publish_hailing_admin_realtime(updated, "hailing.trip.terminal")
    return updated


async def record_trip_event(trip: Dict[str, Any], event_type: str, payload: Dict[str, Any]) -> None:
    await database.insert_one("hailing_trip_events", {
        "id": new_id(),
        "trip_id": trip["id"],
        "event_type": event_type,
        "status": trip.get("status"),
        "payload": payload,
        "created_at": now_iso(),
    })


async def _cancel_pending_dispatch_offers(trip_id: str) -> int:
    pending = await database.find_many("hailing_dispatch_offers", {"trip_id": trip_id, "status": "pending"})
    changed = 0
    for offer in pending:
        cancelled = await database.update_one_if(
            "hailing_dispatch_offers",
            {"id": offer["id"], "status": "pending"},
            {"status": "cancelled", "cancelled_at": now_iso(), "updated_at": now_iso()},
        )
        if not cancelled:
            continue
        changed += 1
        await publish_hailing_driver_offer_realtime(cancelled, "hailing.offer.cancelled", version=2)
        if offer.get("driver_id"):
            await release_candidate_reservation(str(offer["driver_id"]), trip_id)
    return changed


async def close_search_no_driver(trip: Dict[str, Any], reason: str) -> Dict[str, Any]:
    updated = await transition_trip(trip, "NO_DRIVER_FOUND", {"no_driver_reason": reason, "search_ended_at": now_iso()})
    await _cancel_pending_dispatch_offers(trip["id"])
    await create_app_notification(
        user_id=trip["passenger_user_id"],
        title="No drivers nearby",
        body="No drivers are available nearby right now. You can try again shortly.",
        notification_type="trip_updates",
        data={"notification_target": "hailing_trip", "hailing_trip_id": trip["id"]},
    )
    logger.info("no_driver_found trip_id=%s city_id=%s reason=%s", trip["id"], trip.get("city_id"), reason)
    return updated


async def driver_profile_for_user(user: Dict[str, Any]) -> Dict[str, Any]:
    _require_hailing_enabled()
    if user.get("role") not in {"driver", "admin"}:
        raise PermissionError("A Driver account is required for Ride Now.")
    driver = await database.find_one("drivers", {"user_id": user["id"]})
    if not driver:
        raise PermissionError("Complete Driver verification before using Ride Now.")
    if not driver.get("verified") or driver.get("verification_status") != "approved":
        raise PermissionError("Approved Driver verification is required for Ride Now.")
    if str(driver.get("status") or "").lower() in {"suspended", "blocked"}:
        raise PermissionError("This Driver account cannot use Ride Now.")
    if driver.get("hailing_enabled") is not True:
        raise PermissionError("Admin approval is required before using Ride Now.")
    return driver


async def approved_driver_for_hailing(user: Dict[str, Any], city_id: str, ride_class: str) -> Dict[str, Any]:
    driver = await driver_profile_for_user(user)
    approved_cities = driver.get("approved_hailing_city_ids") or []
    if city_id not in approved_cities:
        raise PermissionError("Admin approval is required before driving Ride Now in this city.")
    approved_classes = driver.get("approved_hailing_classes") or []
    if ride_class not in approved_classes:
        raise PermissionError("This vehicle is not approved for that Ride Now class.")
    return driver


async def latest_vehicle(driver: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    vehicles = await database.find_many("vehicles", {"driver_id": driver["id"]})
    return sorted(vehicles, key=lambda item: item.get("created_at") or "", reverse=True)[0] if vehicles else None


def driver_snapshot(driver: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "driver_id": driver.get("id"),
        "user_id": user.get("id"),
        "name": user.get("name") or driver.get("name") or "LetsGoRide Driver",
        "rating": driver.get("rating"),
        "profile_photo_url": user.get("profile_photo_url"),
    }


def vehicle_snapshot(vehicle: Optional[Dict[str, Any]], driver: Dict[str, Any]) -> Dict[str, Any]:
    if not vehicle:
        return {"vehicle": driver.get("vehicle") or "Approved vehicle"}
    return {
        "vehicle_id": vehicle.get("id"),
        "make": vehicle.get("make"),
        "model": vehicle.get("model"),
        "color": vehicle.get("color"),
        "plate_number": vehicle.get("plate_number"),
    }


async def create_trip_from_quote(payload: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    _require_hailing_enabled()
    existing = await active_trip_for_user(user)
    if existing:
        return public_trip(existing, user)
    quote = await database.find_one("hailing_quotes", {"id": payload["quote_id"], "user_id": user["id"]})
    if not quote or quote_expired(quote):
        raise ValueError("This Ride Now quote has expired. Please request a new fare.")
    if payload.get("client_request_id"):
        prior = await database.find_one(
            "hailing_trips",
            {"passenger_user_id": user["id"], "client_request_id": payload["client_request_id"]},
        )
        if prior:
            return public_trip(prior, user)
    timestamp = now_iso()
    city = await get_city(quote["city_id"])
    policy = dispatch_policy(city)
    search_expires_at = (datetime.now(timezone.utc) + timedelta(seconds=policy.search_timeout_seconds)).isoformat()
    trip = {
        "id": new_id(),
        "quote_id": quote["id"],
        "passenger_user_id": user["id"],
        "passenger_snapshot": {"user_id": user["id"], "name": user.get("name") or "Passenger", "rating": user.get("rating")},
        "driver_user_id": None,
        "driver_id": None,
        "vehicle_id": None,
        "city_id": quote["city_id"],
        "ride_class": quote["fare"]["ride_class"],
        "pickup": quote["pickup"],
        "dropoff": quote["dropoff"],
        "route": quote["route"],
        "fare": quote["fare"],
        "payment_method": payload["payment_method"],
        "payment_status": "cash_due" if payload["payment_method"] == "cash" else "pending",
        "status": "SEARCHING",
        "verify_ride_with_pin": bool(payload.get("verify_ride_with_pin")),
        "search_started_at": timestamp,
        "search_expires_at": search_expires_at,
        "next_dispatch_at": timestamp,
        "current_dispatch_radius_km": policy.initial_radius_km,
        "dispatch_attempt_count": 0,
        "dispatch_claim_token": None,
        "dispatch_claim_expires_at": timestamp,
        "client_request_id": payload.get("client_request_id"),
        "realtime_version": 1,
        "created_at": timestamp,
        "updated_at": timestamp,
    }
    created = await database.insert_one("hailing_trips", trip)
    logger.info("hailing_request_created trip_id=%s city_id=%s ride_class=%s", created["id"], created["city_id"], created["ride_class"])
    await record_trip_event(created, "hailing_request_created", {})
    await publish_hailing_trip_realtime(created, "hailing.trip.created")
    await publish_hailing_admin_realtime(created, "hailing.trip.created")
    await create_dispatch_offer(created)
    return public_trip(await database.find_one("hailing_trips", {"id": created["id"]}) or created, user)


async def _claim_dispatch_attempt(trip_id: str) -> tuple[str, Optional[Dict[str, Any]]]:
    token = new_id()
    now = datetime.now(timezone.utc)
    lease_expires_at = (now + timedelta(seconds=15)).isoformat()
    updates = {
        "dispatch_claim_token": token,
        "dispatch_claim_expires_at": lease_expires_at,
        "updated_at": now_iso(),
    }
    claimed = await database.update_one_if(
        "hailing_trips",
        {"id": trip_id, "status": "SEARCHING", "dispatch_claim_token": None},
        updates,
    )
    if not claimed:
        claimed = await database.update_one_if(
            "hailing_trips",
            {"id": trip_id, "status": "SEARCHING", "dispatch_claim_expires_at": {"$lte": now.isoformat()}},
            updates,
        )
    return token, claimed


async def _release_dispatch_claim(trip_id: str, token: str) -> None:
    await database.update_one_if(
        "hailing_trips",
        {"id": trip_id, "dispatch_claim_token": token},
        {"dispatch_claim_token": None, "dispatch_claim_expires_at": now_iso(), "updated_at": now_iso()},
    )


async def create_dispatch_offer(trip: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not _hailing_enabled():
        return None
    claim_token, current = await _claim_dispatch_attempt(trip["id"])
    if not current:
        pending = await database.find_many("hailing_dispatch_offers", {"trip_id": trip["id"], "status": "pending"})
        return sorted(pending, key=lambda item: item.get("created_at") or "")[0] if pending else None

    try:
        pending = await database.find_many("hailing_dispatch_offers", {"trip_id": current["id"], "status": "pending"})
        if pending:
            return sorted(pending, key=lambda item: item.get("created_at") or "")[0]
        city = await get_city(current["city_id"])
        if not city:
            await close_search_no_driver(current, "city_unavailable")
            return None
        policy = dispatch_policy(city)
        radius = min(float(current.get("current_dispatch_radius_km") or policy.initial_radius_km), policy.maximum_radius_km)
        candidates = await ranked_dispatch_candidates(current, radius, policy)
        if not candidates:
            next_dispatch_at = (
                datetime.now(timezone.utc) + timedelta(seconds=policy.dispatch_sweeper_interval_seconds)
            ).isoformat()
            await update_versioned_hailing_trip(
                {"id": current["id"], "status": "SEARCHING"},
                {
                    "current_dispatch_radius_km": policy.next_radius(radius),
                    "next_dispatch_at": next_dispatch_at,
                    "updated_at": now_iso(),
                },
            )
            return None

        for candidate in candidates:
            reserved = await reserve_candidate(candidate, current, policy)
            if not reserved:
                continue
            timestamp = now_iso()
            expires_at = (datetime.now(timezone.utc) + timedelta(seconds=policy.offer_timeout_seconds)).isoformat()
            try:
                offer = await database.insert_one("hailing_dispatch_offers", {
                    "id": new_id(),
                    "trip_id": current["id"],
                    "driver_id": candidate["driver_id"],
                    "driver_user_id": candidate["user_id"],
                    "status": "pending",
                    **offer_ranking_fields(candidate, len(candidates)),
                    "offered_at": timestamp,
                    "expires_at": expires_at,
                    "created_at": timestamp,
                    "updated_at": timestamp,
                })
            except Exception:
                await release_candidate_reservation(str(candidate["driver_id"]), current["id"])
                raise

            updated_trip = await update_versioned_hailing_trip(
                {"id": current["id"], "status": "SEARCHING"},
                {
                    "current_dispatch_radius_km": radius,
                    "dispatch_attempt_count": int(current.get("dispatch_attempt_count") or 0) + 1,
                    "last_offer_id": offer["id"],
                    "last_offer_at": timestamp,
                    "next_dispatch_at": expires_at,
                    "updated_at": timestamp,
                },
            )
            if not updated_trip:
                cancelled = await database.update_one_if(
                    "hailing_dispatch_offers",
                    {"id": offer["id"], "status": "pending"},
                    {"status": "cancelled", "cancelled_at": now_iso(), "updated_at": now_iso()},
                )
                if cancelled:
                    await publish_hailing_driver_offer_realtime(cancelled, "hailing.offer.cancelled", version=2)
                await release_candidate_reservation(str(candidate["driver_id"]), current["id"])
                return None
            logger.info(
                "offer_created offer_id=%s trip_id=%s driver_id=%s ranking=%s candidates=%s",
                offer["id"],
                current["id"],
                offer["driver_id"],
                offer.get("ranking_method"),
                offer.get("candidate_count"),
            )
            await publish_hailing_driver_offer_realtime(offer, "hailing.offer.created", version=1)
            fare = current.get("fare") or {}
            route = current.get("route") or {}
            await create_app_notification(
                user_id=str(offer["driver_user_id"]),
                title="New Ride Now request",
                body=f"${float(fare.get('total_fare') or 0):.2f} · {float(route.get('distance_km') or 0):.1f} km · {str(current.get('ride_class') or 'Ride').title()}",
                notification_type="trip_updates",
                data={
                    "notification_target": "hailing_driver_offer",
                    "hailing_offer_id": offer["id"],
                    "hailing_trip_id": current["id"],
                },
            )
            return offer
        return None
    finally:
        await _release_dispatch_claim(trip["id"], claim_token)


async def eligible_drivers(trip: Dict[str, Any], radius_km: float, stale_seconds: int) -> List[Dict[str, Any]]:
    """Compatibility surface backed by the single authoritative dispatch engine."""
    city = await get_city(trip.get("city_id"))
    policy = replace(dispatch_policy(city), driver_stale_seconds=stale_seconds)
    return await ranked_dispatch_candidates(trip, radius_km, policy)


async def driver_go_online(payload: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    _require_hailing_enabled()
    driver = await approved_driver_for_hailing(user, payload["city_id"], payload["ride_class"])
    city = await get_city(payload["city_id"])
    if not city or not city.get("enabled") or not city.get("ride_hailing_enabled"):
        raise ValueError("Ride Now is not enabled in that city.")
    vehicle = await latest_vehicle(driver)
    timestamp = now_iso()
    presence = {
        "id": f"hailing-presence-{driver['id']}",
        "driver_id": driver["id"],
        "user_id": user["id"],
        "vehicle_id": payload.get("vehicle_id") or (vehicle or {}).get("id"),
        "city_id": city["id"],
        "ride_class": payload["ride_class"],
        "status": "available",
        "location": {"type": "Point", "coordinates": [payload["location"]["longitude"], payload["location"]["latitude"]]},
        "heading": payload.get("heading"),
        "speed": payload.get("speed"),
        "accuracy": payload.get("accuracy"),
        "offered_trip_id": None,
        "offered_at": None,
        "last_seen_at": timestamp,
        "last_location_at": timestamp,
        "online_since": timestamp,
        "updated_at": timestamp,
    }
    existing = await database.find_one("hailing_driver_presence", {"driver_id": driver["id"]})
    if existing:
        updated = await database.update_one("hailing_driver_presence", existing["id"], presence)
        return updated or {**existing, **presence}
    return await database.insert_one("hailing_driver_presence", presence)


async def driver_go_offline(user: Dict[str, Any]) -> Dict[str, Any]:
    driver = await driver_profile_for_user(user)
    presence = await database.find_one("hailing_driver_presence", {"driver_id": driver["id"]})
    if not presence:
        return {"status": "offline"}
    active = await active_trip_for_user(user)
    if active:
        raise ValueError("Complete or cancel the active Ride Now trip before going offline.")
    updated = await database.update_one(
        "hailing_driver_presence",
        presence["id"],
        {"status": "offline", "offered_trip_id": None, "offered_at": None, "updated_at": now_iso()},
    )
    pending = await database.find_many("hailing_dispatch_offers", {"driver_id": driver["id"], "status": "pending"})
    for offer in pending:
        cancelled = await database.update_one_if(
            "hailing_dispatch_offers",
            {"id": offer["id"], "status": "pending"},
            {"status": "cancelled", "cancelled_at": now_iso(), "updated_at": now_iso()},
        )
        if cancelled:
            await publish_hailing_driver_offer_realtime(cancelled, "hailing.offer.cancelled", version=2)
            trip = await database.find_one("hailing_trips", {"id": offer.get("trip_id")})
            if trip and trip.get("status") == "SEARCHING":
                await create_dispatch_offer(trip)
    return updated or {"status": "offline"}


async def update_driver_presence(payload: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    driver = await driver_profile_for_user(user)
    presence = await database.find_one("hailing_driver_presence", {"driver_id": driver["id"]})
    if not presence or presence.get("status") == "offline":
        raise ValueError("Go online before sending Ride Now location updates.")
    status = presence.get("status") if presence.get("status") in {"offered", "en_route", "arrived", "on_trip"} else "available"
    updated = await database.update_one("hailing_driver_presence", presence["id"], {
        "status": status,
        "location": {"type": "Point", "coordinates": [payload["location"]["longitude"], payload["location"]["latitude"]]},
        "heading": payload.get("heading"),
        "speed": payload.get("speed"),
        "accuracy": payload.get("accuracy"),
        "last_seen_at": now_iso(),
        "last_location_at": now_iso(),
        "updated_at": now_iso(),
    })
    return updated or presence


async def current_driver_offer(user: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    driver = await driver_profile_for_user(user)
    offers = await database.find_many("hailing_dispatch_offers", {"driver_id": driver["id"], "status": "pending"})
    now = datetime.now(timezone.utc)
    pending = [offer for offer in offers if (parse_time(offer.get("expires_at")) or now) > now]
    if not pending:
        return None
    offer = sorted(pending, key=lambda item: item.get("offered_at") or "")[0]
    trip = await database.find_one("hailing_trips", {"id": offer["trip_id"]})
    return {"offer": offer, "trip": public_trip(trip, user) if trip else None}


async def accept_offer(offer_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    _require_hailing_enabled()
    driver = await driver_profile_for_user(user)
    active = await active_trip_for_user(user)
    if active:
        raise ValueError("Complete your active Ride Now trip before accepting another ride.")
    offer = await database.find_one("hailing_dispatch_offers", {"id": offer_id, "driver_id": driver["id"]})
    if not offer or offer.get("status") != "pending":
        raise ValueError("Ride offer is no longer available.")
    if quote_expired({"expires_at": offer.get("expires_at")}):
        expired_offer = await database.update_one_if(
            "hailing_dispatch_offers",
            {"id": offer["id"], "status": "pending"},
            {"status": "expired", "expired_at": now_iso(), "updated_at": now_iso()},
        )
        if expired_offer:
            await publish_hailing_driver_offer_realtime(expired_offer, "hailing.offer.expired", version=2)
        await release_candidate_reservation(driver["id"], offer["trip_id"])
        trip = await database.find_one("hailing_trips", {"id": offer["trip_id"]})
        if trip and trip.get("status") == "SEARCHING":
            await create_dispatch_offer(trip)
        raise ValueError("Ride offer has expired.")
    trip = await database.find_one("hailing_trips", {"id": offer["trip_id"]})
    if not trip or trip.get("status") != "SEARCHING":
        raise ValueError("Ride already accepted.")
    await approved_driver_for_hailing(user, trip["city_id"], trip["ride_class"])
    vehicle = await latest_vehicle(driver)
    accepted_offer = await database.update_one_if(
        "hailing_dispatch_offers",
        {"id": offer["id"], "status": "pending"},
        {"status": "accepted", "accepted_at": now_iso(), "updated_at": now_iso()},
    )
    if not accepted_offer:
        raise ValueError("Ride already accepted.")
    user_doc = await database.find_one("users", {"id": user["id"]}) or user
    updated_trip = await update_versioned_hailing_trip(
        {"id": trip["id"], "status": "SEARCHING"},
        {
            "status": "DRIVER_ASSIGNED",
            "driver_id": driver["id"],
            "driver_user_id": user["id"],
            "vehicle_id": (vehicle or {}).get("id"),
            "driver_snapshot": driver_snapshot(driver, user_doc),
            "vehicle_snapshot": vehicle_snapshot(vehicle, driver),
            "plain_trip_pin": None,
            "trip_pin_salt": None,
            "trip_pin_code_hash": None,
            "trip_pin_attempts": 0,
            "trip_pin_generated_at": None,
            "trip_pin_verified_at": None,
            "assigned_at": now_iso(),
            "dispatch_claim_token": None,
            "dispatch_claim_expires_at": now_iso(),
            "updated_at": now_iso(),
        },
    )
    if not updated_trip:
        cancelled_offer = await database.update_one_if(
            "hailing_dispatch_offers",
            {"id": offer["id"], "status": "accepted"},
            {"status": "cancelled", "cancelled_at": now_iso(), "updated_at": now_iso()},
        )
        if cancelled_offer:
            await publish_hailing_driver_offer_realtime(cancelled_offer, "hailing.offer.cancelled", version=3)
        await release_candidate_reservation(driver["id"], trip["id"])
        raise ValueError("Ride already accepted.")
    await publish_hailing_driver_offer_realtime(accepted_offer, "hailing.offer.accepted", version=2)
    await _cancel_pending_dispatch_offers(trip["id"])
    transitioned = await release_candidate_reservation(driver["id"], trip["id"], next_status="en_route")
    if not transitioned:
        await database.update_one(
            "hailing_driver_presence",
            f"hailing-presence-{driver['id']}",
            {"status": "en_route", "offered_trip_id": None, "offered_at": None, "updated_at": now_iso()},
        )
    await create_app_notification(
        user_id=updated_trip["passenger_user_id"],
        title="Driver found",
        body="Your LetsGoRide driver is on the way.",
        notification_type="trip_updates",
        data={"notification_target": "hailing_trip", "hailing_trip_id": updated_trip["id"]},
    )
    logger.info("offer_accepted offer_id=%s trip_id=%s driver_id=%s", offer_id, trip["id"], driver["id"])
    await record_trip_event(updated_trip, "offer_accepted", {})
    await publish_hailing_trip_realtime(updated_trip, "hailing.trip.driver_assigned")
    await publish_hailing_admin_realtime(updated_trip, "hailing.trip.driver_assigned")
    return public_trip(updated_trip, user)


async def decline_offer(offer_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    driver = await driver_profile_for_user(user)
    offer = await database.find_one("hailing_dispatch_offers", {"id": offer_id, "driver_id": driver["id"]})
    if not offer or offer.get("status") != "pending":
        raise ValueError("Ride offer is no longer available.")
    updated = await database.update_one_if(
        "hailing_dispatch_offers",
        {"id": offer["id"], "status": "pending"},
        {"status": "declined", "declined_at": now_iso(), "updated_at": now_iso()},
    )
    if not updated:
        raise ValueError("Ride offer is no longer available.")
    await publish_hailing_driver_offer_realtime(updated, "hailing.offer.declined", version=2)
    await release_candidate_reservation(driver["id"], offer["trip_id"])
    logger.info("offer_declined offer_id=%s trip_id=%s driver_id=%s", offer_id, offer.get("trip_id"), driver["id"])
    trip = await database.find_one("hailing_trips", {"id": offer["trip_id"]})
    if trip and trip.get("status") == "SEARCHING":
        await create_dispatch_offer(trip)
    return updated


async def mark_arrived(trip_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    _require_hailing_enabled()
    trip = await get_authorized_trip(trip_id, user)
    if trip.get("driver_user_id") != user.get("id"):
        raise PermissionError("Only the assigned driver can mark arrival.")
    updated = await transition_trip(trip, "DRIVER_ARRIVED", {"arrived_at": now_iso()})
    await database.update_one("hailing_driver_presence", f"hailing-presence-{trip['driver_id']}", {"status": "arrived", "updated_at": now_iso()})
    await create_app_notification(user_id=trip["passenger_user_id"], title="Driver arrived", body="Your driver has arrived.", notification_type="trip_updates", data={"notification_target": "hailing_trip", "hailing_trip_id": trip_id})
    return public_trip(updated, user)


async def confirm_passenger_boarding(trip_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    _require_hailing_enabled()
    trip = await get_authorized_trip(trip_id, user)
    if trip.get("passenger_user_id") != user.get("id"):
        raise PermissionError("Only the passenger can confirm boarding.")
    if trip.get("status") == "PASSENGER_CONFIRMED_BOARDING":
        return public_trip(trip, user)
    if trip.get("status") != "DRIVER_ARRIVED":
        raise ValueError("You can prepare a safety PIN after your driver has arrived.")
    if not trip.get("driver_user_id"):
        raise ValueError("A driver must be assigned before a safety PIN can be prepared.")
    if not trip.get("verify_ride_with_pin"):
        raise ValueError("This Ride Now trip does not require passenger boarding confirmation.")
    pin, pin_record = _new_trip_pin_record()
    updates: Dict[str, Any] = {
        "passenger_boarding_confirmed_at": now_iso(),
        "passenger_boarding_confirmed_by_user_id": user["id"],
        **pin_record,
    }
    updated = await transition_trip(trip, "PASSENGER_CONFIRMED_BOARDING", updates)
    await create_app_notification(
        user_id=trip["driver_user_id"],
        title="Safety PIN ready",
        body="The passenger enabled Ride Now PIN verification. Verify the PIN before starting.",
        notification_type="trip_updates",
        data={"notification_target": "hailing_trip", "hailing_trip_id": trip_id},
    )
    response = public_trip(updated, user)
    response["trip_pin"] = pin
    return response


async def regenerate_trip_pin(trip_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    _require_hailing_enabled()
    trip = await get_authorized_trip(trip_id, user)
    if trip.get("passenger_user_id") != user.get("id"):
        raise PermissionError("Only the passenger can generate the trip PIN.")
    if not trip.get("verify_ride_with_pin"):
        raise ValueError("This Ride Now trip does not require a PIN.")
    if trip.get("status") != "PASSENGER_CONFIRMED_BOARDING":
        raise ValueError("A new PIN can only be generated after the safety PIN flow is started.")
    if trip.get("trip_pin_verified_at"):
        raise ValueError("The trip PIN has already been verified.")
    pin, pin_record = _new_trip_pin_record()
    updated = await update_versioned_hailing_trip(
        {"id": trip["id"], "status": "PASSENGER_CONFIRMED_BOARDING"},
        {**pin_record, "updated_at": now_iso()},
    )
    if not updated:
        raise ValueError("Ride Now trip changed while the PIN was being generated. Refresh and try again.")
    await record_trip_event(updated, "trip_pin_regenerated", {})
    await publish_hailing_trip_realtime(updated, "hailing.trip.pin_regenerated")
    return {**public_trip(updated, user), "trip_pin": pin}


async def verify_trip_pin(trip_id: str, pin: str, user: Dict[str, Any]) -> Dict[str, Any]:
    _require_hailing_enabled()
    trip = await get_authorized_trip(trip_id, user)
    if trip.get("driver_user_id") != user.get("id"):
        raise PermissionError("Only the assigned driver can verify the trip PIN.")
    if not trip.get("verify_ride_with_pin"):
        raise ValueError("This Ride Now trip does not require a PIN.")
    if trip.get("status") != "PASSENGER_CONFIRMED_BOARDING":
        raise ValueError("Trip PIN can only be verified after the passenger starts the safety PIN flow.")
    attempts = int(trip.get("trip_pin_attempts") or 0)
    if attempts >= 5:
        raise ValueError("Too many incorrect PIN attempts.")
    if not code_matches(trip, pin, "trip_pin"):
        await database.update_one("hailing_trips", trip["id"], {"trip_pin_attempts": attempts + 1, "updated_at": now_iso()})
        raise ValueError("Trip PIN is incorrect.")
    updated = await update_versioned_hailing_trip(
        {"id": trip["id"], "status": "PASSENGER_CONFIRMED_BOARDING"},
        {
            "trip_pin_verified_at": now_iso(),
            "trip_pin_salt": None,
            "trip_pin_code_hash": None,
            "plain_trip_pin": None,
            "updated_at": now_iso(),
        },
    )
    if not updated:
        raise ValueError("Ride Now trip changed while the PIN was being verified. Refresh and try again.")
    await record_trip_event(updated, "trip_pin_verified", {})
    await publish_hailing_trip_realtime(updated, "hailing.trip.pin_verified")
    logger.info("pin_verified trip_id=%s driver_id=%s", trip_id, trip.get("driver_id"))
    return public_trip(updated, user)


async def start_trip(trip_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    _require_hailing_enabled()
    trip = await get_authorized_trip(trip_id, user)
    if trip.get("driver_user_id") != user.get("id"):
        raise PermissionError("Only the assigned driver can start this trip.")
    await approved_driver_for_hailing(user, trip["city_id"], trip["ride_class"])
    verify_with_pin = bool(trip.get("verify_ride_with_pin"))
    if verify_with_pin:
        if trip.get("status") != "PASSENGER_CONFIRMED_BOARDING":
            raise ValueError("This ride uses safety PIN verification. Ask the passenger to prepare their PIN first.")
        if not trip.get("trip_pin_verified_at"):
            raise ValueError("Verify the passenger PIN before starting this trip.")
    elif trip.get("status") not in {"DRIVER_ARRIVED", "PASSENGER_CONFIRMED_BOARDING"}:
        raise ValueError("Mark your arrival at the pickup point before starting this trip.")
    await _ensure_driver_near_pickup_for_start(trip)
    updated = await transition_trip(trip, "IN_PROGRESS", {"started_at": now_iso()})
    await database.update_one("hailing_driver_presence", f"hailing-presence-{trip['driver_id']}", {"status": "on_trip", "updated_at": now_iso()})
    await create_app_notification(user_id=trip["passenger_user_id"], title="Trip started", body="Your Ride Now trip has started.", notification_type="trip_updates", data={"notification_target": "hailing_trip", "hailing_trip_id": trip_id})
    return public_trip(updated, user)


async def _ensure_driver_near_pickup_for_start(trip: Dict[str, Any]) -> None:
    city = await get_city(trip["city_id"])
    policy = dispatch_policy(city)
    allowed_meters = float(policy.boarding_start_radius_meters)
    latest = trip.get("driver_location")
    if not latest and trip.get("driver_id"):
        presence = await database.find_one("hailing_driver_presence", {"driver_id": trip["driver_id"]})
        coords = ((presence or {}).get("location") or {}).get("coordinates") or []
        if len(coords) == 2:
            latest = {
                "latitude": coords[1],
                "longitude": coords[0],
                "accuracy": (presence or {}).get("accuracy"),
            }
    if not latest:
        return
    distance_meters = haversine_km(
        point(trip["pickup"]["latitude"], trip["pickup"]["longitude"]),
        point(latest["latitude"], latest["longitude"]),
    ) * 1000
    accuracy = latest.get("accuracy")
    if isinstance(accuracy, (int, float)) and accuracy > 0:
        allowed_meters += min(float(accuracy), 500.0)
    if distance_meters > allowed_meters:
        raise ValueError("Move closer to the pickup point before starting the trip.")


async def update_trip_location(trip_id: str, payload: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    _require_hailing_enabled()
    trip = await get_authorized_trip(trip_id, user)
    if trip.get("driver_user_id") != user.get("id"):
        raise PermissionError("Only the assigned driver can update trip location.")
    if trip.get("status") not in ACTIVE_DRIVER_STATUSES:
        raise ValueError("Live trip location is only available during active trips.")
    location = {
        "latitude": payload["location"]["latitude"],
        "longitude": payload["location"]["longitude"],
        "heading": payload.get("heading"),
        "speed": payload.get("speed"),
        "accuracy": payload.get("accuracy"),
        "updated_at": now_iso(),
    }
    updated = await update_versioned_hailing_trip({"id": trip["id"]}, {"driver_location": location, "updated_at": now_iso()})
    if trip.get("driver_id"):
        await database.update_one("hailing_driver_presence", f"hailing-presence-{trip['driver_id']}", {
            "location": {"type": "Point", "coordinates": [location["longitude"], location["latitude"]]},
            "last_seen_at": now_iso(),
            "last_location_at": now_iso(),
            "updated_at": now_iso(),
        })
    await publish_hailing_trip_realtime(updated or trip, "hailing.trip.location_updated")
    return public_trip(updated or trip, user)


async def complete_trip(trip_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    _require_hailing_enabled()
    trip = await get_authorized_trip(trip_id, user)
    if trip.get("driver_user_id") != user.get("id"):
        raise PermissionError("Only the assigned driver can complete this trip.")
    updated = await transition_trip(trip, "COMPLETED", {"completed_at": now_iso(), "payment_status": "cash_collected" if trip.get("payment_method") == "cash" else trip.get("payment_status")})
    if trip.get("driver_id"):
        await database.update_one(
            "hailing_driver_presence",
            f"hailing-presence-{trip['driver_id']}",
            {"status": "available", "offered_trip_id": None, "offered_at": None, "updated_at": now_iso()},
        )
    await create_app_notification(user_id=trip["passenger_user_id"], title="Trip completed", body="Thanks for riding with LetsGoRide.", notification_type="trip_updates", data={"notification_target": "hailing_trip", "hailing_trip_id": trip_id})
    return public_trip(updated, user)


async def cancel_trip(trip_id: str, reason: Optional[str], user: Dict[str, Any]) -> Dict[str, Any]:
    _require_hailing_enabled()
    trip = await get_authorized_trip(trip_id, user)
    if trip.get("status") in FINAL_STATUSES:
        raise ValueError("This trip is already closed.")
    if user.get("role") == "admin":
        status = "CANCELLED_BY_ADMIN"
    elif trip.get("passenger_user_id") == user.get("id"):
        if trip.get("status") == "IN_PROGRESS":
            raise ValueError("Contact support to cancel an in-progress trip.")
        status = "CANCELLED_BY_PASSENGER"
    elif trip.get("driver_user_id") == user.get("id"):
        if trip.get("status") == "IN_PROGRESS":
            raise ValueError("Contact support to cancel an in-progress trip.")
        updated = await rematch_after_driver_cancellation(trip, reason, user)
        return public_trip(updated, user)
    else:
        raise PermissionError("You can only cancel Ride Now trips connected to your account.")
    updated = await transition_trip(trip, status, {"cancelled_at": now_iso(), "cancelled_by": user.get("id"), "cancel_reason": reason})
    await _cancel_pending_dispatch_offers(trip["id"])
    if trip.get("driver_id"):
        await database.update_one(
            "hailing_driver_presence",
            f"hailing-presence-{trip['driver_id']}",
            {"status": "available", "offered_trip_id": None, "offered_at": None, "updated_at": now_iso()},
        )
    return public_trip(updated, user)


async def rematch_after_driver_cancellation(trip: Dict[str, Any], reason: Optional[str], user: Dict[str, Any]) -> Dict[str, Any]:
    if trip.get("status") not in {"DRIVER_ASSIGNED", "DRIVER_EN_ROUTE", "DRIVER_ARRIVED", "PASSENGER_CONFIRMED_BOARDING"}:
        raise ValueError("This trip cannot be rematched from its current state.")
    timestamp = now_iso()
    former_driver_id = trip.get("driver_id")
    updated = await update_versioned_hailing_trip(
        {"id": trip["id"], "status": trip["status"], "driver_user_id": user["id"]},
        {
            "status": "SEARCHING",
            "driver_user_id": None,
            "driver_id": None,
            "vehicle_id": None,
            "driver_snapshot": None,
            "vehicle_snapshot": None,
            "driver_location": None,
            "plain_trip_pin": None,
            "trip_pin_salt": None,
            "trip_pin_code_hash": None,
            "trip_pin_attempts": 0,
            "trip_pin_generated_at": None,
            "trip_pin_verified_at": None,
            "passenger_boarding_confirmed_at": None,
            "passenger_boarding_confirmed_by_user_id": None,
            "previous_driver_cancelled_at": timestamp,
            "previous_driver_cancelled_by_driver_id": former_driver_id,
            "previous_driver_cancel_reason": reason,
            "current_dispatch_radius_km": float(trip.get("current_dispatch_radius_km") or 2),
            "dispatch_claim_token": None,
            "dispatch_claim_expires_at": timestamp,
            "next_dispatch_at": timestamp,
            "updated_at": timestamp,
        },
    )
    if not updated:
        raise ValueError("Ride Now trip changed while it was being cancelled. Refresh and try again.")
    if former_driver_id:
        await database.update_one(
            "hailing_driver_presence",
            f"hailing-presence-{former_driver_id}",
            {"status": "available", "offered_trip_id": None, "offered_at": None, "updated_at": now_iso()},
        )
        await database.update_many(
            "hailing_dispatch_offers",
            {"trip_id": trip["id"], "driver_id": former_driver_id, "status": "accepted"},
            {"status": "cancelled", "cancelled_at": timestamp, "updated_at": timestamp},
        )
    await record_trip_event(updated, "driver_cancelled_rematch", {"former_driver_id": former_driver_id})
    await publish_hailing_trip_realtime(updated, "hailing.trip.driver_cancelled_rematch")
    await create_app_notification(
        user_id=trip["passenger_user_id"],
        title="Driver cancelled",
        body="Your driver cancelled. We're finding another driver.",
        notification_type="trip_updates",
        data={"notification_target": "hailing_trip", "hailing_trip_id": trip["id"]},
    )
    await create_dispatch_offer(updated)
    return await database.find_one("hailing_trips", {"id": trip["id"]}) or updated


async def record_safety_event(trip_id: str, payload: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    _require_hailing_enabled()
    trip = await get_authorized_trip(trip_id, user)
    event = await database.insert_one("hailing_trip_events", {
        "id": new_id(),
        "trip_id": trip["id"],
        "event_type": "safety_event",
        "actor_user_id": user.get("id"),
        "kind": payload["kind"],
        "message": payload.get("message"),
        "created_at": now_iso(),
    })
    await write_audit_log(
        actor_user_id=user.get("id"),
        actor_role=user.get("role"),
        action="hailing_safety_event",
        target_type="hailing_trip",
        target_id=trip["id"],
        metadata={"kind": payload["kind"]},
    )
    await notify_admins("safety_alerts", "Ride Now safety event", "A Ride Now safety event was reported.", {"notification_target": "admin_hailing_trip", "hailing_trip_id": trip_id})
    return event


async def expire_pending_offers() -> int:
    if not _hailing_enabled():
        return 0
    now = datetime.now(timezone.utc)
    pending = await database.find_many(
        "hailing_dispatch_offers",
        {"status": "pending", "expires_at": {"$lte": now.isoformat()}},
        sort=[("expires_at", 1), ("created_at", 1)],
        limit=EXPIRED_OFFER_SWEEP_BATCH_SIZE,
    )
    changed = 0
    for offer in pending:
        expires_at = parse_time(offer.get("expires_at"))
        if not expires_at or expires_at > now:
            continue
        expired = await database.update_one_if(
            "hailing_dispatch_offers",
            {"id": offer["id"], "status": "pending"},
            {"status": "expired", "expired_at": now_iso(), "updated_at": now_iso()},
        )
        if not expired:
            continue
        changed += 1
        await publish_hailing_driver_offer_realtime(expired, "hailing.offer.expired", version=2)
        driver_id = offer.get("driver_id")
        if driver_id:
            await release_candidate_reservation(str(driver_id), str(offer.get("trip_id") or ""))
        trip = await database.find_one("hailing_trips", {"id": offer.get("trip_id")})
        if trip and trip.get("status") == "SEARCHING":
            await update_versioned_hailing_trip(
                {"id": trip["id"], "status": "SEARCHING"},
                {"next_dispatch_at": now.isoformat(), "updated_at": now_iso()},
            )
            await create_dispatch_offer(trip)
    return changed


async def sweep_searching_trips() -> Dict[str, int]:
    if not _hailing_enabled():
        return {"checked": 0, "dispatched": 0, "timed_out": 0}
    now = datetime.now(timezone.utc)
    now_text = now.isoformat()
    searching = await database.find_many(
        "hailing_trips",
        {
            "status": "SEARCHING",
            "$or": [
                {"search_expires_at": {"$lte": now_text}},
                {"next_dispatch_at": {"$lte": now_text}},
                {"next_dispatch_at": {"$exists": False}},
            ],
        },
        sort=[("search_expires_at", 1), ("created_at", 1)],
        limit=DISPATCH_SWEEP_BATCH_SIZE,
    )
    dispatched = 0
    timed_out = 0
    for trip in searching:
        expires_at = parse_time(trip.get("search_expires_at"))
        if expires_at and expires_at <= now:
            await close_search_no_driver(trip, "search_timeout")
            timed_out += 1
            continue
        before_offer = await database.find_many("hailing_dispatch_offers", {"trip_id": trip["id"], "status": "pending"})
        if before_offer:
            continue
        offer = await create_dispatch_offer(trip)
        if offer:
            dispatched += 1
    return {"checked": len(searching), "dispatched": dispatched, "timed_out": timed_out}


async def sweep_hailing_dispatch() -> Dict[str, int]:
    if not _hailing_enabled():
        return {"expired_offers": 0, "checked": 0, "dispatched": 0, "timed_out": 0}
    expired = await expire_pending_offers()
    searching = await sweep_searching_trips()
    return {"expired_offers": expired, **searching}


async def hailing_dispatch_sweeper(stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        interval = 3
        if not _hailing_enabled():
            logger.info("hailing_dispatch_sweeper_stopped feature_disabled=true")
            return
        try:
            cities = await list_hailing_city_dispatch_settings()
            if cities:
                interval = max(2, min(int(city.get("dispatch_sweeper_interval_seconds") or 3) for city in cities))
            await sweep_hailing_dispatch()
        except Exception as exc:
            logger.warning("hailing_dispatch_sweep_failed error=%s", str(exc)[:300])
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval)
        except asyncio.TimeoutError:
            continue


async def list_hailing_city_dispatch_settings() -> List[Dict[str, Any]]:
    if not _hailing_enabled():
        return []
    cities = await database.find_many("hailing_cities", {"enabled": True, "ride_hailing_enabled": True})
    return [
        {"dispatch_sweeper_interval_seconds": dispatch_policy(city).dispatch_sweeper_interval_seconds}
        for city in cities
    ]


async def driver_stats(user: Dict[str, Any]) -> Dict[str, Any]:
    driver = await driver_profile_for_user(user)
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    trips = await database.find_many(
        "hailing_trips",
        {
            "driver_id": driver["id"],
            "status": "COMPLETED",
            "completed_at": {"$gte": today_start.isoformat()},
        },
        sort=[("completed_at", -1)],
    )
    gross = sum(float((trip.get("fare") or {}).get("total_fare") or 0) for trip in trips)
    commission = sum(float((trip.get("fare") or {}).get("platform_commission") or 0) for trip in trips)
    return {
        "driver_id": driver["id"],
        "today_ride_count": len(trips),
        "today_gross_fares": round(gross, 2),
        "today_platform_commission": round(commission, 2),
        "today_estimated_earnings": round(max(0, gross - commission), 2),
    }
