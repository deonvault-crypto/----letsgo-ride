from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, Optional

from fastapi import APIRouter, Depends

from app.database import database
from app.ops_auth import get_ops_user
from app.utils import api_success


router = APIRouter(prefix="/ops", tags=["operations-live-map"])

PRESENCE_STALE_SECONDS = 180
ENTITY_LIMIT = 200
ACTIVE_JOB_LIMIT = 200
CASE_OPEN_STATUSES = {"open", "in_progress", "waiting_customer", "escalated"}
FINAL_HAILING_STATUSES = {
    "COMPLETED",
    "CANCELLED",
    "CANCELLED_BY_PASSENGER",
    "CANCELLED_BY_DRIVER",
    "EXPIRED",
    "NO_DRIVER_FOUND",
    "completed",
    "cancelled",
    "cancelled_by_passenger",
    "cancelled_by_driver",
    "expired",
    "no_driver_found",
}
FINAL_COURIER_STATUSES = {
    "DELIVERED",
    "COMPLETED",
    "CANCELLED",
    "delivered",
    "completed",
    "cancelled",
}
PENDING_VERIFICATION_STATUSES = [
    "pending",
    "pending_uploads",
    "pending_auto_check",
    "needs_review",
    "needs_resubmission",
]


def _fresh_cutoff() -> str:
    return (datetime.now(timezone.utc) - timedelta(seconds=PRESENCE_STALE_SECONDS)).isoformat()


def _geo_coordinates(location: Any) -> tuple[Optional[float], Optional[float]]:
    if not isinstance(location, dict):
        return None, None
    coordinates = location.get("coordinates")
    if not isinstance(coordinates, (list, tuple)) or len(coordinates) < 2:
        return None, None
    longitude, latitude = coordinates[0], coordinates[1]
    if not isinstance(latitude, (int, float)) or isinstance(latitude, bool):
        return None, None
    if not isinstance(longitude, (int, float)) or isinstance(longitude, bool):
        return None, None
    latitude = float(latitude)
    longitude = float(longitude)
    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        return None, None
    return latitude, longitude


def _by_id(rows: Iterable[Dict[str, Any]], key: str = "id") -> Dict[str, Dict[str, Any]]:
    return {str(row.get(key)): row for row in rows if row.get(key)}


def _active_hailing_for_driver(rows: Iterable[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    result: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        driver_id = str(row.get("driver_id") or "")
        driver_user_id = str(row.get("driver_user_id") or "")
        if driver_id:
            result[driver_id] = row
        if driver_user_id:
            result[f"user:{driver_user_id}"] = row
    return result


def _active_delivery_for_courier(rows: Iterable[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    return {
        str(row.get("courier_user_id")): row
        for row in rows
        if row.get("courier_user_id")
    }


def _job_summary(row: Optional[Dict[str, Any]], job_type: str) -> Optional[Dict[str, Any]]:
    if not row:
        return None
    if job_type == "hailing_trip":
        return {
            "id": row.get("id"),
            "type": job_type,
            "status": row.get("status"),
            "pickup": row.get("pickup"),
            "dropoff": row.get("dropoff"),
            "updated_at": row.get("updated_at"),
        }
    return {
        "id": row.get("id"),
        "type": job_type,
        "status": row.get("status"),
        "pickup_address": row.get("pickup_address"),
        "dropoff_address": row.get("dropoff_address"),
        "updated_at": row.get("updated_at"),
    }


def _vehicle_summary(vehicle: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not vehicle:
        return None
    return {
        "make": vehicle.get("make"),
        "model": vehicle.get("model"),
        "color": vehicle.get("color"),
        "plate_number": vehicle.get("plate_number"),
    }


@router.get("/live-map")
async def live_map_snapshot(user=Depends(get_ops_user)):
    del user  # Access is enforced by the dependency; the read model is role-safe and sanitized.
    cutoff = _fresh_cutoff()

    (
        hailing_presence,
        courier_profiles,
        active_hailing,
        active_deliveries,
        pending_verifications,
        open_reports,
        open_support,
        open_ops_cases,
        manager_escalations,
        admin_escalations,
    ) = await asyncio.gather(
        database.find_many(
            "hailing_driver_presence",
            {"status": {"$ne": "offline"}, "last_seen_at": {"$gte": cutoff}},
            sort=[("last_seen_at", -1)],
            limit=ENTITY_LIMIT,
        ),
        database.find_many(
            "courier_profiles",
            {
                "online": True,
                "status": "APPROVED",
                "location": {"$ne": None},
                "last_seen_at": {"$gte": cutoff},
            },
            sort=[("last_seen_at", -1)],
            limit=ENTITY_LIMIT,
        ),
        database.find_many(
            "hailing_trips",
            {"status": {"$nin": sorted(FINAL_HAILING_STATUSES)}},
            sort=[("updated_at", -1)],
            limit=ACTIVE_JOB_LIMIT,
        ),
        database.find_many(
            "courier_deliveries",
            {"status": {"$nin": sorted(FINAL_COURIER_STATUSES)}},
            sort=[("updated_at", -1)],
            limit=ACTIVE_JOB_LIMIT,
        ),
        database.count("drivers", {"verification_status": {"$in": PENDING_VERIFICATION_STATUSES}}),
        database.count("reports", {"status": {"$nin": ["resolved", "dismissed"]}}),
        database.count("support_messages", {"status": {"$nin": ["resolved", "closed"]}}),
        database.count("ops_cases", {"status": {"$in": sorted(CASE_OPEN_STATUSES)}}),
        database.count(
            "ops_cases",
            {"status": {"$in": sorted(CASE_OPEN_STATUSES)}, "escalation_level": "manager"},
        ),
        database.count(
            "ops_cases",
            {"status": {"$in": sorted(CASE_OPEN_STATUSES)}, "escalation_level": "admin"},
        ),
    )

    hailing_user_ids = [str(row.get("user_id")) for row in hailing_presence if row.get("user_id")]
    courier_user_ids = [str(row.get("user_id")) for row in courier_profiles if row.get("user_id")]
    all_user_ids = sorted(set(hailing_user_ids + courier_user_ids))

    driver_ids = [str(row.get("driver_id")) for row in hailing_presence if row.get("driver_id")]
    vehicle_ids = [str(row.get("vehicle_id")) for row in hailing_presence if row.get("vehicle_id")]

    users_task = database.find_many("users", {"id": {"$in": all_user_ids}}, limit=ENTITY_LIMIT * 2) if all_user_ids else asyncio.sleep(0, result=[])
    drivers_task = database.find_many("drivers", {"id": {"$in": driver_ids}}, limit=ENTITY_LIMIT) if driver_ids else asyncio.sleep(0, result=[])
    vehicles_task = database.find_many("vehicles", {"id": {"$in": vehicle_ids}}, limit=ENTITY_LIMIT) if vehicle_ids else asyncio.sleep(0, result=[])
    users, drivers, vehicles = await asyncio.gather(users_task, drivers_task, vehicles_task)

    users_by_id = _by_id(users)
    drivers_by_id = _by_id(drivers)
    vehicles_by_id = _by_id(vehicles)
    hailing_jobs = _active_hailing_for_driver(active_hailing)
    courier_jobs = _active_delivery_for_courier(active_deliveries)

    entities = []

    for presence in hailing_presence:
        latitude, longitude = _geo_coordinates(presence.get("location"))
        if latitude is None or longitude is None:
            continue
        user_id = str(presence.get("user_id") or "")
        driver_id = str(presence.get("driver_id") or "")
        user_row = users_by_id.get(user_id) or {}
        driver_row = drivers_by_id.get(driver_id) or {}
        vehicle_row = vehicles_by_id.get(str(presence.get("vehicle_id") or ""))
        active_job = hailing_jobs.get(driver_id) or hailing_jobs.get(f"user:{user_id}")
        entities.append({
            "id": f"driver:{driver_id or user_id}",
            "entity_type": "driver",
            "display_name": user_row.get("name") or driver_row.get("name") or "LetsGoRide Driver",
            "operational_status": presence.get("status") or "available",
            "latitude": latitude,
            "longitude": longitude,
            "heading": presence.get("heading"),
            "speed": presence.get("speed"),
            "accuracy": presence.get("accuracy"),
            "updated_at": presence.get("last_seen_at") or presence.get("updated_at"),
            "city_id": presence.get("city_id"),
            "ride_class": presence.get("ride_class"),
            "vehicle": _vehicle_summary(vehicle_row),
            "active_job": _job_summary(active_job, "hailing_trip"),
        })

    for profile in courier_profiles:
        latitude, longitude = _geo_coordinates(profile.get("location"))
        if latitude is None or longitude is None:
            continue
        user_id = str(profile.get("user_id") or "")
        user_row = users_by_id.get(user_id) or {}
        active_job = courier_jobs.get(user_id)
        entities.append({
            "id": f"courier:{user_id or profile.get('id')}",
            "entity_type": "courier",
            "display_name": user_row.get("name") or profile.get("name") or "LetsGoRide Courier",
            "operational_status": "delivery" if active_job else "available",
            "latitude": latitude,
            "longitude": longitude,
            "heading": profile.get("location_heading"),
            "speed": profile.get("location_speed"),
            "accuracy": profile.get("location_accuracy"),
            "updated_at": profile.get("last_seen_at") or profile.get("updated_at"),
            "city_id": profile.get("city_id"),
            "ride_class": None,
            "vehicle": None,
            "active_job": _job_summary(active_job, "courier_delivery"),
        })

    attention_breakdown = {
        "pending_verification": pending_verifications,
        "safety": open_reports,
        "support": open_support,
        "manager_escalations": manager_escalations,
        "admin_escalations": admin_escalations,
    }
    attention_total = sum(int(value or 0) for value in attention_breakdown.values())

    return api_success({
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "stale_after_seconds": PRESENCE_STALE_SECONDS,
        "kpis": {
            "active_hailing": len(active_hailing),
            "online_drivers": sum(1 for item in entities if item["entity_type"] == "driver"),
            "online_couriers": sum(1 for item in entities if item["entity_type"] == "courier"),
            "active_deliveries": len(active_deliveries),
            "attention": attention_total,
            "open_ops_cases": open_ops_cases,
            "attention_breakdown": attention_breakdown,
        },
        "entities": entities,
    })
