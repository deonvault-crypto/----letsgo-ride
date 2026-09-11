import asyncio
import logging
from datetime import datetime, time, timedelta, timezone
from typing import Any, Dict, List, Optional

from app.database import database
from app.services.audit_service import write_audit_log
from app.services.notification_service import notify_users
from app.services.profile_photo_service import absolute_profile_photo_url
from app.services.review_service import completed_trips_count_for_user, public_review_summary_for_user
from app.services.ride_realtime_service import (
    insert_versioned_ride,
    publish_ride_realtime,
    ride_event_type,
    ride_realtime_version,
    update_versioned_ride,
)
from app.utils import new_id, now_iso


logger = logging.getLogger(__name__)

ZIMBABWE_TZ = timezone(timedelta(hours=2))
TRIP_STATUS_DRAFT = "DRAFT"
TRIP_STATUS_SCHEDULED = "SCHEDULED"
TRIP_STATUS_BOARDING = "BOARDING"
TRIP_STATUS_IN_PROGRESS = "IN_PROGRESS"
TRIP_STATUS_COMPLETED = "COMPLETED"
TRIP_STATUS_CANCELLED = "CANCELLED"
TRIP_STATUS_EXPIRED = "EXPIRED"
FINAL_TRIP_STATUSES = {TRIP_STATUS_COMPLETED, TRIP_STATUS_CANCELLED, TRIP_STATUS_EXPIRED}
BOARDING_WINDOW_MINUTES = 15
ARRIVAL_GRACE_MINUTES = 60
DEFAULT_ESTIMATED_DURATION_MINUTES = 240


def canonical_trip_status(status: Optional[str]) -> str:
    normalized = str(status or TRIP_STATUS_SCHEDULED).strip().upper()
    legacy = {
        "OPEN": TRIP_STATUS_SCHEDULED,
        "CLOSED": TRIP_STATUS_COMPLETED,
        "DEPARTED": TRIP_STATUS_IN_PROGRESS,
        "CANCELLED": TRIP_STATUS_CANCELLED,
    }
    return legacy.get(normalized, normalized)


def is_active_trip_status(status: Optional[str]) -> bool:
    return canonical_trip_status(status) in {TRIP_STATUS_BOARDING, TRIP_STATUS_IN_PROGRESS}


def is_final_trip_status(status: Optional[str]) -> bool:
    return canonical_trip_status(status) in FINAL_TRIP_STATUSES


def ride_departure_datetime(ride: Dict[str, Any]) -> Optional[datetime]:
    date_value = str(ride.get("date") or "").strip()
    time_value = str(ride.get("time") or "").strip()
    if not date_value:
        return None
    try:
        parsed_date = datetime.strptime(date_value, "%Y-%m-%d").date()
    except ValueError:
        return None
    parsed_time = time(23, 59)
    if time_value:
        for pattern in ("%H:%M", "%H:%M:%S"):
            try:
                parsed_time = datetime.strptime(time_value, pattern).time()
                break
            except ValueError:
                continue
    return datetime.combine(parsed_date, parsed_time, tzinfo=ZIMBABWE_TZ)


def estimated_duration_minutes(ride: Dict[str, Any]) -> int:
    try:
        value = int(ride.get("estimated_duration_minutes") or DEFAULT_ESTIMATED_DURATION_MINUTES)
    except (TypeError, ValueError):
        value = DEFAULT_ESTIMATED_DURATION_MINUTES
    return max(15, min(value, 1440))


def ride_estimated_arrival_datetime(ride: Dict[str, Any]) -> Optional[datetime]:
    departure_at = ride_departure_datetime(ride)
    if not departure_at:
        return None
    return departure_at + timedelta(minutes=estimated_duration_minutes(ride))


def boarding_starts_datetime(ride: Dict[str, Any]) -> Optional[datetime]:
    departure_at = ride_departure_datetime(ride)
    if not departure_at:
        return None
    return departure_at - timedelta(minutes=BOARDING_WINDOW_MINUTES)


async def confirmed_request_count(ride_id: str) -> int:
    requests = await database.find_many("ride_requests", {"ride_id": ride_id})
    return len([request for request in requests if request.get("status") == "confirmed"])


async def confirmed_passenger_user_ids(ride_id: str) -> List[str]:
    requests = await database.find_many("ride_requests", {"ride_id": ride_id})
    return [request.get("user_id") for request in requests if request.get("status") == "confirmed" and request.get("user_id")]


async def derive_trip_status(ride: Dict[str, Any], now: Optional[datetime] = None) -> str:
    now = now or datetime.now(ZIMBABWE_TZ)
    current_status = canonical_trip_status(ride.get("status"))
    if current_status in FINAL_TRIP_STATUSES or current_status == TRIP_STATUS_DRAFT:
        return current_status

    departure_at = ride_departure_datetime(ride)
    if not departure_at:
        return current_status

    estimated_arrival_at = ride_estimated_arrival_datetime(ride)
    auto_complete_at = estimated_arrival_at + timedelta(minutes=ARRIVAL_GRACE_MINUTES) if estimated_arrival_at else None
    if current_status == TRIP_STATUS_IN_PROGRESS and auto_complete_at and now >= auto_complete_at:
        return TRIP_STATUS_COMPLETED

    if current_status in {TRIP_STATUS_SCHEDULED, TRIP_STATUS_BOARDING} and now >= departure_at:
        return TRIP_STATUS_IN_PROGRESS

    boarding_at = boarding_starts_datetime(ride)
    if current_status == TRIP_STATUS_SCHEDULED and boarding_at and boarding_at <= now < departure_at:
        return TRIP_STATUS_BOARDING

    return current_status


async def _notify_confirmed_passengers(ride: Dict[str, Any], notification_type: str, title: str, body: str) -> None:
    passenger_ids = await confirmed_passenger_user_ids(ride["id"])
    await notify_users(
        passenger_ids,
        notification_type,
        title,
        body,
        {"ride_id": ride.get("id"), "trip_status": canonical_trip_status(ride.get("status"))},
    )


async def _notify_review_unlocked(ride: Dict[str, Any]) -> None:
    passenger_ids = await confirmed_passenger_user_ids(ride["id"])
    recipient_ids = [ride.get("user_id"), *passenger_ids]
    await notify_users(
        recipient_ids,
        "trip_review",
        "How was your trip?",
        f"Your ride from {ride.get('origin')} to {ride.get('destination')} is complete. Leave a quick review.",
        {"ride_id": ride.get("id"), "trip_status": TRIP_STATUS_COMPLETED},
    )


async def apply_ride_lifecycle(ride: Dict[str, Any], *, persist: bool = True) -> Dict[str, Any]:
    next_status = await derive_trip_status(ride)
    current_status = canonical_trip_status(ride.get("status"))
    updates: Dict[str, Any] = {}

    if next_status != current_status:
        updates["status"] = next_status
        if next_status == TRIP_STATUS_BOARDING:
            updates["boarding_started_at"] = now_iso()
        if next_status == TRIP_STATUS_IN_PROGRESS:
            updates["auto_started_at"] = now_iso()
            updates["started_at"] = ride.get("started_at") or updates["auto_started_at"]
        if next_status == TRIP_STATUS_COMPLETED:
            updates["auto_completed_at"] = now_iso()
            updates["completed_at"] = ride.get("completed_at") or updates["auto_completed_at"]
            updates["live_tracking_enabled"] = False
        if next_status == TRIP_STATUS_EXPIRED:
            updates["expired_at"] = now_iso()
            updates["live_tracking_enabled"] = False

    if updates and persist:
        updates["updated_at"] = now_iso()
        updated = await update_versioned_ride(
            {"id": ride["id"], "status": ride.get("status")},
            updates,
        )
        ride = updated or {**ride, **updates}
        if updated:
            await publish_ride_realtime(updated, ride_event_type(updated))
        if next_status == TRIP_STATUS_IN_PROGRESS and not ride.get("started_notification_sent_at"):
            await database.update_one("rides", ride["id"], {"started_notification_sent_at": now_iso()})
            await _notify_confirmed_passengers(
                ride,
                "ride_departure",
                "Ride departure time reached",
                f"Your ride from {ride.get('origin')} to {ride.get('destination')} is scheduled to depart now.",
            )
        if next_status == TRIP_STATUS_COMPLETED and not ride.get("completed_notification_sent_at"):
            await database.update_one("rides", ride["id"], {"completed_notification_sent_at": now_iso()})
            await _notify_confirmed_passengers(
                ride,
                "trip_updates",
                "Ride completed",
                f"Your ride from {ride.get('origin')} to {ride.get('destination')} has been completed.",
            )
        if next_status == TRIP_STATUS_COMPLETED and not ride.get("review_prompt_notification_sent_at"):
            await database.update_one("rides", ride["id"], {"review_prompt_notification_sent_at": now_iso()})
            await _notify_review_unlocked(ride)

    return {**ride, **updates}


async def sweep_ride_lifecycle() -> Dict[str, int]:
    rides = await database.find_many("rides")
    changed = 0
    for ride in rides:
        before = canonical_trip_status(ride.get("status"))
        updated = await apply_ride_lifecycle(ride)
        after = canonical_trip_status(updated.get("status"))
        if before != after:
            changed += 1
    return {"checked": len(rides), "changed": changed}


async def ride_lifecycle_sweeper(stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        try:
            await sweep_ride_lifecycle()
        except Exception as exc:
            logger.warning("ride_lifecycle_sweep_failed error=%s", str(exc)[:300])
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=60)
        except asyncio.TimeoutError:
            continue


def has_ride_departed(ride: Dict[str, Any]) -> bool:
    departure_at = ride_departure_datetime(ride)
    return bool(departure_at and departure_at <= datetime.now(ZIMBABWE_TZ))


def public_ride_status(ride: Dict[str, Any]) -> str:
    return canonical_trip_status(ride.get("status"))


def is_bookable_public_ride(ride: Dict[str, Any]) -> bool:
    departure_at = ride_departure_datetime(ride)
    return bool(
        public_ride_status(ride) == TRIP_STATUS_SCHEDULED
        and departure_at
        and datetime.now(ZIMBABWE_TZ) < departure_at
    )


def _public_driver_photo_url(user: Optional[Dict[str, Any]]) -> Optional[str]:
    if not user:
        return None
    photo_url = user.get("profile_photo_url") or user.get("profile_picture") or user.get("avatar_url") or user.get("photo_url")
    if not photo_url or str(photo_url).startswith("file://"):
        return None
    return absolute_profile_photo_url(str(photo_url))


async def enrich_ride(ride: Dict[str, Any], current_user: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    ride = await apply_ride_lifecycle(ride)
    enriched = dict(ride)
    driver_user_id = ride.get("user_id")
    if not driver_user_id and ride.get("driver_id"):
        driver_profile = await database.find_one("drivers", {"id": ride.get("driver_id")})
        driver_user_id = driver_profile.get("user_id") if driver_profile else None
    driver_user = await database.find_one("users", {"id": driver_user_id}) if driver_user_id else None
    departure_at = ride_departure_datetime(ride)
    boarding_at = boarding_starts_datetime(ride)
    estimated_arrival_at = ride_estimated_arrival_datetime(ride)
    auto_complete_at = estimated_arrival_at + timedelta(minutes=ARRIVAL_GRACE_MINUTES) if estimated_arrival_at else None
    status = public_ride_status(ride)
    now = datetime.now(ZIMBABWE_TZ)
    enriched["status"] = status
    enriched["legacy_status"] = {
        TRIP_STATUS_SCHEDULED: "open",
        TRIP_STATUS_BOARDING: "open",
        TRIP_STATUS_IN_PROGRESS: "departed",
        TRIP_STATUS_COMPLETED: "completed",
        TRIP_STATUS_CANCELLED: "cancelled",
        TRIP_STATUS_EXPIRED: "departed",
    }.get(status, str(status).lower())
    enriched["departure_at"] = departure_at.isoformat() if departure_at else None
    enriched["boarding_starts_at"] = boarding_at.isoformat() if boarding_at else None
    enriched["estimated_arrival_at"] = estimated_arrival_at.isoformat() if estimated_arrival_at else None
    enriched["auto_complete_at"] = auto_complete_at.isoformat() if auto_complete_at else None
    enriched["estimated_duration_minutes"] = estimated_duration_minutes(ride)
    enriched["is_departed"] = status in {TRIP_STATUS_IN_PROGRESS, TRIP_STATUS_COMPLETED, TRIP_STATUS_EXPIRED}
    enriched["is_bookable"] = is_bookable_public_ride(ride)
    enriched["can_start_trip"] = bool(
        current_user
        and ride.get("user_id") == current_user.get("id")
        and status in {TRIP_STATUS_SCHEDULED, TRIP_STATUS_BOARDING}
        and boarding_at
        and now >= boarding_at
    )
    enriched["can_end_trip"] = bool(current_user and ride.get("user_id") == current_user.get("id") and status == TRIP_STATUS_IN_PROGRESS)
    enriched["live_tracking_active"] = bool(status == TRIP_STATUS_IN_PROGRESS and ride.get("live_tracking_enabled"))
    enriched["last_driver_location"] = ride.get("last_driver_location") if status == TRIP_STATUS_IN_PROGRESS else None
    if driver_user:
        review_summary = await public_review_summary_for_user(driver_user["id"], include_latest=False)
        completed_trips_count = await completed_trips_count_for_user(driver_user["id"], "driver")
        enriched["driver_user_id"] = driver_user.get("id")
        enriched["driver_name"] = driver_user.get("name") or ride.get("driver_name") or "LetsGo Driver"
        enriched["driver_profile_photo_url"] = _public_driver_photo_url(driver_user)
        enriched["driver_avatar_url"] = enriched["driver_profile_photo_url"]
        enriched["driver_verification_status"] = driver_user.get("verification_status") or ride.get("driver_verification_status")
        enriched["driver_rating"] = review_summary["average_rating"] if review_summary["review_count"] > 0 else None
        enriched["driver_review_count"] = review_summary["review_count"]
        enriched["driver_completed_trips_count"] = completed_trips_count
    else:
        enriched["driver_profile_photo_url"] = None
        enriched["driver_avatar_url"] = None
    enriched["is_own_ride"] = bool(current_user and ride.get("user_id") == current_user.get("id"))
    enriched.pop("driver_phone", None)
    enriched.pop("driver_email", None)
    return enriched


async def list_public_rides(current_user: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    rides = await database.find_many("rides")
    rows = []
    for ride in rides:
        lifecycle_ride = await apply_ride_lifecycle(ride)
        if is_bookable_public_ride(lifecycle_ride):
            rows.append(await enrich_ride(lifecycle_ride, current_user))
    return rows


async def list_user_rides(current_user: Dict[str, Any]) -> List[Dict[str, Any]]:
    rides = await database.find_many("rides", {"user_id": current_user.get("id")})
    rows = []
    for ride in rides:
        lifecycle_ride = await apply_ride_lifecycle(ride)
        rows.append(await enrich_ride(lifecycle_ride, current_user))
    return sorted(rows, key=lambda item: item.get("departure_at") or item.get("date") or "", reverse=True)


async def search_rides(
    origin: Optional[str] = None,
    destination: Optional[str] = None,
    seats: int = 1,
    date: Optional[str] = None,
    current_user: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    rides = await list_public_rides(current_user)
    normalized_origin = (origin or "").strip().lower()
    normalized_destination = (destination or "").strip().lower()
    normalized_date = (date or "").strip()

    results = []
    for ride in rides:
        if normalized_origin and normalized_origin not in ride["origin"].lower():
            continue
        if normalized_destination and normalized_destination not in ride["destination"].lower():
            continue
        if normalized_date and ride.get("date") != normalized_date:
            continue
        if int(ride.get("available_seats", 0)) < seats:
            continue
        results.append(ride)
    return results



async def create_ride(payload: Dict[str, Any]) -> Dict[str, Any]:
    timestamp = now_iso()
    ride = {
        "id": new_id(),
        "driver_id": payload.get("driver_id") or new_id(),
        "status": TRIP_STATUS_SCHEDULED,
        "estimated_duration_minutes": payload.get("estimated_duration_minutes") or DEFAULT_ESTIMATED_DURATION_MINUTES,
        "live_tracking_enabled": False,
        "created_at": timestamp,
        "updated_at": timestamp,
        **payload,
    }
    created = await insert_versioned_ride(ride)
    await publish_ride_realtime(created, ride_event_type(created, created=True))
    return await enrich_ride(created, {"id": payload.get("user_id")})


def user_owns_ride(user: Dict[str, Any], ride: Dict[str, Any]) -> bool:
    return bool(user and ride and ride.get("user_id") == user.get("id"))


async def user_can_view_live_trip(user: Dict[str, Any], ride: Dict[str, Any]) -> bool:
    if user.get("role") == "admin" or user_owns_ride(user, ride):
        return True
    requests = await database.find_many("ride_requests", {"ride_id": ride.get("id"), "user_id": user.get("id")})
    return any(request.get("status") == "confirmed" for request in requests)


async def start_trip(ride_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    ride = await database.find_one("rides", {"id": ride_id})
    if not ride:
        raise ValueError("Ride not found.")
    if not user_owns_ride(user, ride):
        raise PermissionError("Only the driver can start this trip.")

    ride = await apply_ride_lifecycle(ride)
    status = canonical_trip_status(ride.get("status"))
    if status not in {TRIP_STATUS_SCHEDULED, TRIP_STATUS_BOARDING}:
        raise ValueError("This trip cannot be started.")
    boarding_at = boarding_starts_datetime(ride)
    if boarding_at and datetime.now(ZIMBABWE_TZ) < boarding_at:
        raise ValueError("Start Trip becomes available 15 minutes before departure.")

    timestamp = now_iso()
    updated = await update_versioned_ride(
        {"id": ride_id, "status": ride.get("status")},
        {
            "status": TRIP_STATUS_IN_PROGRESS,
            "started_at": timestamp,
            "started_by_user_id": user["id"],
            "live_tracking_enabled": True,
            "updated_at": timestamp,
        },
    )
    if not updated:
        raise ValueError("This trip changed while it was being started. Refresh and try again.")
    await publish_ride_realtime(updated, "ride.status_changed")
    await _notify_confirmed_passengers(
        updated,
        "ride_departure",
        "Ride has started",
        f"Your ride from {updated.get('origin')} to {updated.get('destination')} is now in progress.",
    )
    await database.update_one("rides", ride_id, {"started_notification_sent_at": timestamp})
    await write_audit_log(
        actor_user_id=user["id"],
        actor_role=user.get("role"),
        action="trip_started",
        target_type="ride",
        target_id=ride_id,
        metadata={"trip_status": TRIP_STATUS_IN_PROGRESS},
    )
    return await enrich_ride(updated, user)


async def end_trip(ride_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    ride = await database.find_one("rides", {"id": ride_id})
    if not ride:
        raise ValueError("Ride not found.")
    if not user_owns_ride(user, ride):
        raise PermissionError("Only the driver can end this trip.")

    ride = await apply_ride_lifecycle(ride)
    if canonical_trip_status(ride.get("status")) != TRIP_STATUS_IN_PROGRESS:
        raise ValueError("Only trips in progress can be ended.")

    timestamp = now_iso()
    updated = await update_versioned_ride(
        {"id": ride_id, "status": ride.get("status")},
        {
            "status": TRIP_STATUS_COMPLETED,
            "completed_at": timestamp,
            "completed_by_user_id": user["id"],
            "live_tracking_enabled": False,
            "updated_at": timestamp,
        },
    )
    if not updated:
        raise ValueError("This trip changed while it was being completed. Refresh and try again.")
    await publish_ride_realtime(updated, "ride.terminal")
    await _notify_confirmed_passengers(
        updated,
        "trip_updates",
        "Ride completed",
        f"Your ride from {updated.get('origin')} to {updated.get('destination')} has been completed.",
    )
    await database.update_one("rides", ride_id, {"completed_notification_sent_at": timestamp})
    if not updated.get("review_prompt_notification_sent_at"):
        await _notify_review_unlocked(updated)
        await database.update_one("rides", ride_id, {"review_prompt_notification_sent_at": timestamp})
    await write_audit_log(
        actor_user_id=user["id"],
        actor_role=user.get("role"),
        action="trip_completed",
        target_type="ride",
        target_id=ride_id,
        metadata={"trip_status": TRIP_STATUS_COMPLETED},
    )
    return await enrich_ride(updated, user)


async def cancel_trip(ride_id: str, user: Dict[str, Any], reason: str) -> Dict[str, Any]:
    ride = await database.find_one("rides", {"id": ride_id})
    if not ride:
        raise ValueError("Ride not found.")
    if not user_owns_ride(user, ride):
        raise PermissionError("Only the driver can cancel this trip.")
    ride = await apply_ride_lifecycle(ride)
    status = canonical_trip_status(ride.get("status"))
    if status not in {TRIP_STATUS_SCHEDULED, TRIP_STATUS_BOARDING}:
        raise ValueError("This trip can no longer be cancelled.")
    timestamp = now_iso()
    updated = await update_versioned_ride(
        {"id": ride_id, "status": ride.get("status")},
        {
            "status": TRIP_STATUS_CANCELLED,
            "cancellation_reason": reason,
            "cancelled_at": timestamp,
            "cancelled_by_user_id": user["id"],
            "live_tracking_enabled": False,
            "updated_at": timestamp,
        },
    )
    if not updated:
        raise ValueError("This trip changed while it was being cancelled. Refresh and try again.")
    await publish_ride_realtime(updated, "ride.terminal")
    await _notify_confirmed_passengers(
        updated,
        "trip_updates",
        "Ride cancelled",
        f"The ride from {updated.get('origin')} to {updated.get('destination')} has been cancelled.",
    )
    await write_audit_log(
        actor_user_id=user["id"],
        actor_role=user.get("role"),
        action="trip_cancelled",
        target_type="ride",
        target_id=ride_id,
        metadata={"trip_status": TRIP_STATUS_CANCELLED},
    )
    return await enrich_ride(updated, user)


async def update_live_location(ride_id: str, user: Dict[str, Any], location: Dict[str, Any]) -> Dict[str, Any]:
    ride = await database.find_one("rides", {"id": ride_id})
    if not ride:
        raise ValueError("Ride not found.")
    if not user_owns_ride(user, ride):
        raise PermissionError("Only the driver can share this trip location.")

    ride = await apply_ride_lifecycle(ride)
    if canonical_trip_status(ride.get("status")) != TRIP_STATUS_IN_PROGRESS:
        raise ValueError("Live location is only available during trips in progress.")

    timestamp = now_iso()
    safe_location = {
        "latitude": location["latitude"],
        "longitude": location["longitude"],
        "accuracy": location.get("accuracy"),
        "heading": location.get("heading"),
        "speed": location.get("speed"),
        "updated_at": timestamp,
    }
    updated = await update_versioned_ride(
        {"id": ride_id, "status": ride.get("status")},
        {
            "last_driver_location": safe_location,
            "live_tracking_enabled": True,
            "live_location_updated_at": timestamp,
            "updated_at": timestamp,
        },
    )
    if not updated:
        raise ValueError("This trip changed while its live location was being updated.")
    await publish_ride_realtime(updated, ride_event_type(updated, location=True))
    return {
        "ride_id": ride_id,
        "realtime_version": ride_realtime_version(updated),
        "trip_status": TRIP_STATUS_IN_PROGRESS,
        "status": TRIP_STATUS_IN_PROGRESS,
        "location": safe_location,
        "last_driver_location": safe_location,
        "updated_at": timestamp,
        "live_tracking_enabled": bool(updated.get("live_tracking_enabled", True)),
    }


async def disable_live_location(ride_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    ride = await database.find_one("rides", {"id": ride_id})
    if not ride:
        raise ValueError("Ride not found.")
    if not user_owns_ride(user, ride):
        raise PermissionError("Only the driver can change live sharing for this trip.")
    if not ride.get("live_tracking_enabled"):
        return await enrich_ride(ride, user)
    updated = await update_versioned_ride(
        {"id": ride_id, "live_tracking_enabled": True},
        {"live_tracking_enabled": False, "updated_at": now_iso()},
    )
    if updated:
        await publish_ride_realtime(updated, "ride.updated")
    return await enrich_ride(updated or ride, user)


async def live_trip_state(ride_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    ride = await database.find_one("rides", {"id": ride_id})
    if not ride:
        raise ValueError("Ride not found.")
    if not await user_can_view_live_trip(user, ride):
        raise PermissionError("You can only view live trips connected to your account.")
    enriched = await enrich_ride(ride, user)
    return {
        "ride_id": ride_id,
        "realtime_version": ride_realtime_version(enriched),
        "status": enriched.get("status"),
        "departure_at": enriched.get("departure_at"),
        "estimated_arrival_at": enriched.get("estimated_arrival_at"),
        "auto_complete_at": enriched.get("auto_complete_at"),
        "live_tracking_enabled": bool(enriched.get("live_tracking_active")),
        "last_driver_location": enriched.get("last_driver_location"),
        "origin": enriched.get("origin"),
        "destination": enriched.get("destination"),
    }
