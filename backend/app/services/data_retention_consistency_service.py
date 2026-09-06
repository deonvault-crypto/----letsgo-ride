from __future__ import annotations

from typing import Any, Dict, Iterable, List

from app.database import database
from app.services.ride_service import (
    TRIP_STATUS_BOARDING,
    TRIP_STATUS_IN_PROGRESS,
    TRIP_STATUS_SCHEDULED,
    canonical_trip_status,
)


ACTIONABLE_REQUEST_STATUSES = {"pending", "confirmed"}
ACTIONABLE_SHARED_RIDE_STATUSES = {
    TRIP_STATUS_SCHEDULED,
    TRIP_STATUS_BOARDING,
    TRIP_STATUS_IN_PROGRESS,
}
APPROVED_DRIVER_STATES = {"approved", "verified", "active"}
RECONCILABLE_WORKER_APPLICATION_STATUSES = {"SUBMITTED", "UNDER_REVIEW"}


def actionable_shared_ride_request_status_counts(
    requests: Iterable[Dict[str, Any]],
    rides: Iterable[Dict[str, Any]],
) -> Dict[str, int]:
    """Count live booking workload without rewriting historical request status."""

    active_ride_ids = {
        str(ride.get("id") or "")
        for ride in rides
        if ride.get("id")
        and canonical_trip_status(ride.get("status")) in ACTIONABLE_SHARED_RIDE_STATUSES
    }
    counts = {"pending": 0, "confirmed": 0}
    for request in requests:
        status = str(request.get("status") or "")
        if status not in ACTIONABLE_REQUEST_STATUSES:
            continue
        if str(request.get("ride_id") or "") not in active_ride_ids:
            continue
        counts[status] += 1
    return counts


async def actionable_shared_ride_request_counts() -> Dict[str, int]:
    """Return actionable shared-ride counts while retaining completed-trip history."""

    requests = await database.find_many(
        "ride_requests",
        {"status": {"$in": sorted(ACTIONABLE_REQUEST_STATUSES)}},
    )
    ride_ids = sorted(
        {
            str(request.get("ride_id") or "")
            for request in requests
            if request.get("ride_id")
        }
    )
    if not ride_ids:
        return {"pending": 0, "confirmed": 0}
    rides = await database.find_many("rides", {"id": {"$in": ride_ids}})
    return actionable_shared_ride_request_status_counts(requests, rides)


def _approved_driver_record(row: Dict[str, Any] | None) -> bool:
    if not row:
        return False
    verification_status = str(row.get("verification_status") or "").strip().lower()
    status = str(row.get("status") or "").strip().lower()
    return verification_status in APPROVED_DRIVER_STATES or status in APPROVED_DRIVER_STATES


async def reconcile_worker_application_status(application: Dict[str, Any]) -> Dict[str, Any]:
    """Expose existing Driver approval as canonical without mutating stored history."""

    result = dict(application)
    stored_status = str(application.get("status") or "")
    if (
        str(application.get("product") or "") != "driver"
        or stored_status not in RECONCILABLE_WORKER_APPLICATION_STATUSES
        or not application.get("user_id")
    ):
        return result

    user_id = str(application["user_id"])
    driver = await database.find_one("drivers", {"user_id": user_id})
    approval_source = "driver_profile" if _approved_driver_record(driver) else None
    if approval_source is None:
        legacy_application = await database.find_one(
            "driver_applications",
            {
                "user_id": user_id,
                "status": {"$in": sorted(APPROVED_DRIVER_STATES)},
            },
        )
        if legacy_application:
            approval_source = "driver_application"

    if approval_source:
        result["stored_status"] = stored_status
        result["status"] = "APPROVED"
        result["status_source"] = approval_source
    return result


async def reconcile_worker_application_statuses(
    applications: Iterable[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    return [await reconcile_worker_application_status(application) for application in applications]
