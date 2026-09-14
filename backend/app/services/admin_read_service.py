from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any, Dict, Iterable, List, Optional

from app.database import database
from app.services.auth_service import public_user
from app.services.ride_service import apply_ride_lifecycle, canonical_trip_status
from app.services.verification_service import public_verification_status


def _group(rows: Iterable[Dict[str, Any]], key: str) -> Dict[str, List[Dict[str, Any]]]:
    grouped: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for row in rows:
        value = row.get(key)
        if value is not None:
            grouped[str(value)].append(row)
    return dict(grouped)


def _request_status_counts(requests: List[Dict[str, Any]]) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for request in requests:
        status = str(request.get("status") or "unknown")
        counts[status] = counts.get(status, 0) + 1
    return counts


def _ride_payload(
    ride: Dict[str, Any],
    ride_requests: List[Dict[str, Any]],
    driver: Optional[Dict[str, Any]],
    conversation_count: int,
) -> Dict[str, Any]:
    enriched = dict(ride)
    enriched["status"] = canonical_trip_status(ride.get("status"))
    enriched["request_count"] = len(ride_requests)
    enriched["pending_request_count"] = sum(1 for item in ride_requests if item.get("status") == "pending")
    enriched["confirmed_booking_count"] = sum(1 for item in ride_requests if item.get("status") == "confirmed")
    enriched["cancelled_request_count"] = sum(
        1 for item in ride_requests if str(item.get("status") or "").startswith("cancelled")
    )
    enriched["request_status_counts"] = _request_status_counts(ride_requests)
    enriched["conversation_count"] = conversation_count
    if driver:
        enriched["driver_profile_photo_url"] = driver.get("profile_photo_url")
        enriched["driver_email"] = driver.get("email")
        enriched["driver_phone"] = driver.get("phone")
        enriched["driver_city"] = driver.get("city")
        enriched["driver_account_status"] = driver.get("status")
        enriched["driver_identity_status"] = public_verification_status(driver)
    return enriched


async def enrich_admin_rides(rides: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not rides:
        return []
    lifecycle_rides = list(await asyncio.gather(*(apply_ride_lifecycle(ride) for ride in rides)))
    ride_ids = [str(ride.get("id")) for ride in lifecycle_rides if ride.get("id")]
    driver_ids = [str(ride.get("user_id")) for ride in lifecycle_rides if ride.get("user_id")]
    ride_requests, drivers, conversations = await asyncio.gather(
        database.find_many("ride_requests", {"ride_id": {"$in": ride_ids}}) if ride_ids else asyncio.sleep(0, result=[]),
        database.find_many("users", {"id": {"$in": driver_ids}}) if driver_ids else asyncio.sleep(0, result=[]),
        database.find_many("conversations", {"ride_id": {"$in": ride_ids}}) if ride_ids else asyncio.sleep(0, result=[]),
    )
    requests_by_ride = _group(ride_requests, "ride_id")
    conversations_by_ride = _group(conversations, "ride_id")
    drivers_by_id = {str(driver.get("id")): driver for driver in drivers if driver.get("id")}
    return [
        _ride_payload(
            ride,
            requests_by_ride.get(str(ride.get("id") or ""), []),
            drivers_by_id.get(str(ride.get("user_id") or "")),
            len(conversations_by_ride.get(str(ride.get("id") or ""), [])),
        )
        for ride in lifecycle_rides
    ]


async def enrich_admin_ride(
    ride: Dict[str, Any],
    requests: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    if requests is None:
        rows = await enrich_admin_rides([ride])
        return rows[0]
    lifecycle_ride = await apply_ride_lifecycle(ride)
    driver, conversations = await asyncio.gather(
        database.find_one("users", {"id": lifecycle_ride.get("user_id")}) if lifecycle_ride.get("user_id") else asyncio.sleep(0, result=None),
        database.find_many("conversations", {"ride_id": lifecycle_ride.get("id")}),
    )
    return _ride_payload(lifecycle_ride, requests, driver, len(conversations))


async def enrich_admin_requests(requests: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not requests:
        return []
    ride_ids = sorted({str(row.get("ride_id")) for row in requests if row.get("ride_id")})
    passenger_ids = sorted({str(row.get("user_id")) for row in requests if row.get("user_id")})
    request_ids = sorted({str(row.get("id")) for row in requests if row.get("id")})
    rides = await database.find_many("rides", {"id": {"$in": ride_ids}}) if ride_ids else []
    lifecycle_rides = list(await asyncio.gather(*(apply_ride_lifecycle(ride) for ride in rides))) if rides else []
    driver_ids = sorted({str(ride.get("user_id")) for ride in lifecycle_rides if ride.get("user_id")})
    all_user_ids = sorted(set(passenger_ids) | set(driver_ids))
    users, request_conversations, ride_conversations = await asyncio.gather(
        database.find_many("users", {"id": {"$in": all_user_ids}}) if all_user_ids else asyncio.sleep(0, result=[]),
        database.find_many("conversations", {"request_id": {"$in": request_ids}}) if request_ids else asyncio.sleep(0, result=[]),
        database.find_many("conversations", {"ride_id": {"$in": ride_ids}}) if ride_ids else asyncio.sleep(0, result=[]),
    )
    rides_by_id = {str(ride.get("id")): ride for ride in lifecycle_rides if ride.get("id")}
    users_by_id = {str(user.get("id")): user for user in users if user.get("id")}
    request_conversations_by_id = _group(request_conversations, "request_id")
    ride_conversations_by_id = _group(ride_conversations, "ride_id")

    enriched_rows: List[Dict[str, Any]] = []
    for request in requests:
        enriched = dict(request)
        ride = rides_by_id.get(str(request.get("ride_id") or ""))
        driver = users_by_id.get(str((ride or {}).get("user_id") or ""))
        passenger = users_by_id.get(str(request.get("user_id") or ""))
        if ride:
            enriched["ride"] = _ride_payload(
                ride,
                [request],
                driver,
                len(ride_conversations_by_id.get(str(ride.get("id") or ""), [])),
            )
        if driver:
            enriched["driver"] = public_user(driver)
            enriched["driver_name"] = driver.get("name")
            enriched["driver_email"] = driver.get("email")
            enriched["driver_phone"] = driver.get("phone")
        if passenger:
            enriched["passenger"] = public_user(passenger)
            enriched["passenger_email"] = passenger.get("email")
            enriched["passenger_city"] = passenger.get("city")
        enriched["conversation_count"] = len(
            request_conversations_by_id.get(str(request.get("id") or ""), [])
        )
        enriched_rows.append(enriched)
    return enriched_rows


async def enrich_admin_request(request: Dict[str, Any]) -> Dict[str, Any]:
    rows = await enrich_admin_requests([request])
    return rows[0]


async def enrich_admin_users(users: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not users:
        return []
    user_ids = [str(user.get("id")) for user in users if user.get("id")]
    rides, requests, support_cases, reports, drivers = await asyncio.gather(
        database.find_many("rides", {"user_id": {"$in": user_ids}}),
        database.find_many("ride_requests", {"user_id": {"$in": user_ids}}),
        database.find_many("support_messages", {"user_id": {"$in": user_ids}}),
        database.find_many("reports", {"user_id": {"$in": user_ids}}),
        database.find_many("drivers", {"user_id": {"$in": user_ids}}),
    )
    rides_by_user = _group(rides, "user_id")
    requests_by_user = _group(requests, "user_id")
    support_by_user = _group(support_cases, "user_id")
    reports_by_user = _group(reports, "user_id")
    drivers_by_user = {
        str(driver.get("user_id")): driver
        for driver in drivers
        if driver.get("user_id")
    }

    result: List[Dict[str, Any]] = []
    for user in users:
        user_id = str(user.get("id") or "")
        user_requests = requests_by_user.get(user_id, [])
        driver = drivers_by_user.get(user_id)
        public = public_user(user)
        public["posted_rides_count"] = len(rides_by_user.get(user_id, []))
        public["ride_requests_count"] = len(user_requests)
        public["confirmed_bookings_count"] = sum(
            1 for request in user_requests if request.get("status") == "confirmed"
        )
        public["support_cases_count"] = len(support_by_user.get(user_id, []))
        public["safety_reports_count"] = len(reports_by_user.get(user_id, []))
        public["driver_verification_status"] = public_verification_status(driver or user)
        public["driver_status"] = (driver or {}).get("status")
        result.append(public)
    return result


async def enrich_admin_user(user: Dict[str, Any]) -> Dict[str, Any]:
    rows = await enrich_admin_users([user])
    return rows[0]
