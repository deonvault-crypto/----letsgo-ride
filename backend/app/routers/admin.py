import mimetypes
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Header, Query
from fastapi.responses import FileResponse

from app.auth import get_admin_user
from app.database import database
from app.models.verification import VerificationStatusUpdateBody
from app.models.request import RideRequestUpdateBody
from app.models.ride import RideUpdateBody
from app.services.audit_service import write_audit_log
from app.services.auth_service import public_user
from app.services.notification_service import create_app_notification
from app.services.ride_service import TRIP_STATUS_BOARDING, TRIP_STATUS_IN_PROGRESS, TRIP_STATUS_SCHEDULED, apply_ride_lifecycle, canonical_trip_status, cleanup_demo_rides
from app.services.verification_service import (
    apply_admin_verification_status,
    manual_verification_documents,
    public_verification_status,
)
from app.utils import api_error, api_success, now_iso


router = APIRouter(prefix="/admin", tags=["admin"])
logger = logging.getLogger(__name__)


def _without_private_fields(rows):
    return [public_user(row) for row in rows]


async def _get_admin_from_header_or_query(
    authorization: str = Header(default=""),
    access_token: Optional[str] = Query(default=None),
):
    token = access_token or authorization.replace("Bearer", "").strip()
    if not token:
        api_error("Admin access is required.", 403)
    user = await database.find_one("users", {"token": token})
    if not user or user.get("role") != "admin":
        api_error("Admin access is required.", 403)
    return user


def _public_document(document):
    return {
        "id": document.get("id"),
        "document_type": document.get("document_type"),
        "file_name": document.get("file_name"),
        "uploaded_at": document.get("uploaded_at"),
        "status": document.get("status", "pending"),
        "rejection_reason": document.get("rejection_reason"),
        "content_type": mimetypes.guess_type(document.get("file_name") or "")[0],
    }


def _is_real_ride(ride: Dict[str, Any]) -> bool:
    return ride.get("is_demo") is not True


def _sort_recent(rows: List[Dict[str, Any]], limit: int = 10) -> List[Dict[str, Any]]:
    return sorted(rows, key=lambda row: row.get("created_at") or row.get("updated_at") or "", reverse=True)[:limit]


def _contains_search(row: Dict[str, Any], search: Optional[str], fields: List[str]) -> bool:
    if not search:
        return True
    term = search.strip().lower()
    return any(term in str(row.get(field) or "").lower() for field in fields)


def _status_tone(status: Optional[str]) -> str:
    if status in {"verified", "confirmed", "resolved", "active", "open"}:
        return "success"
    if status in {"rejected", "cancelled", "cancelled_by_admin", "cancelled_by_driver", "cancelled_by_passenger", "suspended", "deleted", "dismissed"}:
        return "danger"
    if status in {"pending", "needs_review", "submitted", "received", "in_review", "declined", "closed"}:
        return "warning"
    return "neutral"


def _activity_item(
    *,
    kind: str,
    title: str,
    subtitle: str,
    status: Optional[str],
    target_type: str,
    target_id: str,
    created_at: Optional[str],
) -> Dict[str, Any]:
    return {
        "id": f"{kind}:{target_id}",
        "type": kind,
        "title": title,
        "subtitle": subtitle,
        "status": status,
        "tone": _status_tone(status),
        "target_type": target_type,
        "target_id": target_id,
        "created_at": created_at,
    }


def _request_route(request: Dict[str, Any]) -> str:
    snapshot = request.get("ride_snapshot") or {}
    origin = snapshot.get("origin") or "Ride"
    destination = snapshot.get("destination") or "destination"
    return f"{origin} to {destination}"


def _request_status_counts(requests: List[Dict[str, Any]]) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for request in requests:
        status = request.get("status", "unknown")
        counts[status] = counts.get(status, 0) + 1
    return counts


async def _enrich_admin_ride(ride: Dict[str, Any], requests: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    ride = await apply_ride_lifecycle(ride)
    ride_requests = requests if requests is not None else await database.find_many("ride_requests", {"ride_id": ride.get("id")})
    driver = await database.find_one("users", {"id": ride.get("user_id")}) if ride.get("user_id") else None
    conversations = await database.find_many("conversations", {"ride_id": ride.get("id")})
    enriched = dict(ride)
    enriched["status"] = canonical_trip_status(ride.get("status"))
    enriched["request_count"] = len(ride_requests)
    enriched["pending_request_count"] = len([item for item in ride_requests if item.get("status") == "pending"])
    enriched["confirmed_booking_count"] = len([item for item in ride_requests if item.get("status") == "confirmed"])
    enriched["cancelled_request_count"] = len([item for item in ride_requests if str(item.get("status", "")).startswith("cancelled")])
    enriched["request_status_counts"] = _request_status_counts(ride_requests)
    enriched["conversation_count"] = len(conversations)
    if driver:
        enriched["driver_profile_photo_url"] = driver.get("profile_photo_url")
        enriched["driver_email"] = driver.get("email")
        enriched["driver_phone"] = driver.get("phone")
        enriched["driver_city"] = driver.get("city")
        enriched["driver_account_status"] = driver.get("status")
        enriched["driver_identity_status"] = public_verification_status(driver)
    return enriched


async def _enrich_admin_request(request: Dict[str, Any]) -> Dict[str, Any]:
    ride = await database.find_one("rides", {"id": request.get("ride_id")}) if request.get("ride_id") else None
    driver = await database.find_one("users", {"id": ride.get("user_id")}) if ride and ride.get("user_id") else None
    passenger = await database.find_one("users", {"id": request.get("user_id")}) if request.get("user_id") else None
    conversations = await database.find_many("conversations", {"request_id": request.get("id")})
    enriched = dict(request)
    if ride:
        enriched["ride"] = await _enrich_admin_ride(ride, [request])
    if driver:
        enriched["driver"] = public_user(driver)
        enriched["driver_name"] = driver.get("name")
        enriched["driver_email"] = driver.get("email")
        enriched["driver_phone"] = driver.get("phone")
    if passenger:
        enriched["passenger"] = public_user(passenger)
        enriched["passenger_email"] = passenger.get("email")
        enriched["passenger_city"] = passenger.get("city")
    enriched["conversation_count"] = len(conversations)
    return enriched


async def _enrich_admin_user(user: Dict[str, Any]) -> Dict[str, Any]:
    rides = await database.find_many("rides", {"user_id": user.get("id")})
    requests = await database.find_many("ride_requests", {"user_id": user.get("id")})
    support_cases = await database.find_many("support_messages", {"user_id": user.get("id")})
    reports = await database.find_many("reports", {"user_id": user.get("id")})
    driver = await database.find_one("drivers", {"user_id": user.get("id")})
    public = public_user(user)
    public["posted_rides_count"] = len([ride for ride in rides if _is_real_ride(ride)])
    public["ride_requests_count"] = len(requests)
    public["confirmed_bookings_count"] = len([request for request in requests if request.get("status") == "confirmed"])
    public["support_cases_count"] = len(support_cases)
    public["safety_reports_count"] = len(reports)
    public["driver_verification_status"] = public_verification_status(driver or user)
    public["driver_status"] = (driver or {}).get("status")
    return public


def _support_open(status: Optional[str]) -> bool:
    return status not in {"resolved", "closed"}


def _report_open(status: Optional[str]) -> bool:
    return status not in {"resolved", "dismissed"}


@router.get("/overview")
async def overview(admin=Depends(get_admin_user)):
    users = await database.find_many("users")
    rides = [ride for ride in await database.find_many("rides") if _is_real_ride(ride)]
    requests = await database.find_many("ride_requests")
    drivers = await database.find_many("drivers")
    support_messages = await database.find_many("support_messages")
    reports = await database.find_many("reports")
    admin_notifications = await database.find_many("app_notifications", {"user_id": admin["id"]})
    verified_drivers = [driver for driver in drivers if public_verification_status(driver) in {"verified", "active"}]
    pending_verifications = [driver for driver in drivers if public_verification_status(driver) in {"pending", "needs_review"}]
    enriched_rides = [await apply_ride_lifecycle(ride) for ride in rides]
    active_rides = [ride for ride in enriched_rides if canonical_trip_status(ride.get("status")) in {TRIP_STATUS_SCHEDULED, TRIP_STATUS_BOARDING, TRIP_STATUS_IN_PROGRESS}]
    pending_requests = [request for request in requests if request.get("status") == "pending"]
    confirmed_bookings = [request for request in requests if request.get("status") == "confirmed"]
    open_support = [message for message in support_messages if _support_open(message.get("status", "received"))]
    open_reports = [report for report in reports if _report_open(report.get("status", "submitted"))]

    activities = []
    for request in _sort_recent(requests, 8):
        activities.append(
            _activity_item(
                kind="ride_request",
                title=f"{request.get('passenger_name') or 'Passenger'} - {_request_route(request)}",
                subtitle=f"{request.get('seats', 1)} seat request",
                status=request.get("status"),
                target_type="ride_request",
                target_id=request.get("id", ""),
                created_at=request.get("created_at") or request.get("updated_at"),
            )
        )
    for driver in _sort_recent(drivers, 8):
        verification_status = public_verification_status(driver)
        if verification_status in {"pending", "needs_review", "rejected", "verified", "active"}:
            activities.append(
                _activity_item(
                    kind="verification",
                    title=f"{driver.get('name') or 'Driver'} verification",
                    subtitle=f"{len(manual_verification_documents(driver.get('documents', [])))} documents submitted",
                    status=verification_status,
                    target_type="driver",
                    target_id=driver.get("id", ""),
                    created_at=driver.get("verification_submitted_at") or driver.get("updated_at") or driver.get("created_at"),
                )
            )
    for message in _sort_recent(support_messages, 6):
        activities.append(
            _activity_item(
                kind="support",
                title=message.get("subject") or "Support case",
                subtitle=message.get("user_name") or message.get("user_email") or "User",
                status=message.get("status"),
                target_type="support_message",
                target_id=message.get("id", ""),
                created_at=message.get("created_at") or message.get("updated_at"),
            )
        )
    for report in _sort_recent(reports, 6):
        activities.append(
            _activity_item(
                kind="safety_report",
                title=report.get("report_type") or "Safety report",
                subtitle=report.get("user_name") or report.get("user_email") or "User",
                status=report.get("status"),
                target_type="report",
                target_id=report.get("id", ""),
                created_at=report.get("created_at") or report.get("updated_at"),
            )
        )
    recent_activity = _sort_recent(activities, 12)

    return api_success(
        {
            "users": len(users),
            "total_users": len(users),
            "verified_drivers": len(verified_drivers),
            "pending_verifications": len(pending_verifications),
            "pending_driver_verifications": len(pending_verifications),
            "rides": len(rides),
            "active_rides": len(active_rides),
            "requests": len(requests),
            "pending_ride_requests": len(pending_requests),
            "confirmed_bookings": len(confirmed_bookings),
            "support_messages": len(support_messages),
            "open_support_cases": len(open_support),
            "safety_reports": len(reports),
            "open_safety_reports": len(open_reports),
            "unread_admin_notifications": len([notification for notification in admin_notifications if not notification.get("read")]),
            "recent_activity": recent_activity,
        }
    )


@router.get("/users")
async def list_users(
    search: Optional[str] = Query(default=None),
    role: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    verification: Optional[str] = Query(default=None),
    limit: int = Query(default=80, ge=1, le=200),
    admin=Depends(get_admin_user),
):
    users = await database.find_many("users")
    rows = []
    for user in users:
        if role and user.get("role") != role:
            continue
        if status and user.get("status", "active") != status:
            continue
        enriched = await _enrich_admin_user(user)
        verification_status = enriched.get("driver_verification_status") or enriched.get("verification_status") or "not_started"
        if verification and verification_status != verification:
            continue
        if not _contains_search(enriched, search, ["name", "email", "phone", "city", "role", "status"]):
            continue
        rows.append(enriched)
    rows = _sort_recent(rows, limit)
    return api_success({"count": len(rows), "items": rows})


@router.get("/users/{user_id}")
async def user_detail(user_id: str, admin=Depends(get_admin_user)):
    user = await database.find_one("users", {"id": user_id})
    if not user:
        api_error("User not found.", 404)
    rides = [await _enrich_admin_ride(ride) for ride in await database.find_many("rides", {"user_id": user_id}) if _is_real_ride(ride)]
    requests = [await _enrich_admin_request(request) for request in await database.find_many("ride_requests", {"user_id": user_id})]
    support_cases = await database.find_many("support_messages", {"user_id": user_id})
    safety_reports = await database.find_many("reports", {"user_id": user_id})
    driver = await database.find_one("drivers", {"user_id": user_id})
    return api_success(
        {
            "user": await _enrich_admin_user(user),
            "driver": driver,
            "rides": _sort_recent(rides, 20),
            "requests": _sort_recent(requests, 20),
            "support_cases": _sort_recent(support_cases, 20),
            "safety_reports": _sort_recent(safety_reports, 20),
        }
    )


@router.patch("/users/{user_id}/status")
async def update_user_status(
    user_id: str,
    status: str = Query(...),
    reason: Optional[str] = Query(default=None),
    admin=Depends(get_admin_user),
):
    if status not in {"active", "suspended", "deleted"}:
        api_error("Unsupported user status.", 400)
    if status in {"suspended", "deleted"} and not reason:
        api_error("Admin reason is required.", 400)
    user = await database.update_one("users", user_id, {"status": status, "updated_at": now_iso()})
    if not user:
        api_error("User not found.", 404)
    await write_audit_log(
        actor_user_id=admin["id"],
        actor_role=admin.get("role"),
        action="admin_user_status_changed",
        target_type="user",
        target_id=user_id,
        metadata={"status": status, "reason": reason},
    )
    return api_success(public_user(user))


@router.get("/rides")
async def admin_rides(
    search: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    filter: Optional[str] = Query(default=None),
    limit: int = Query(default=80, ge=1, le=200),
    admin=Depends(get_admin_user),
):
    rides = [ride for ride in await database.find_many("rides") if _is_real_ride(ride)]
    rows = []
    for ride in rides:
        enriched = await _enrich_admin_ride(ride)
        if status and enriched.get("status", "open") != status:
            continue
        if filter == "pending_requests" and int(enriched.get("pending_request_count", 0)) == 0:
            continue
        if filter == "full" and int(enriched.get("available_seats", 0)) > 0:
            continue
        if filter == "upcoming" and enriched.get("status", "open") == "cancelled":
            continue
        if not _contains_search(enriched, search, ["origin", "destination", "driver_name", "vehicle", "date", "status"]):
            continue
        rows.append(enriched)
    return api_success({"count": len(rows), "items": _sort_recent(rows, limit)})


@router.get("/rides/{ride_id}")
async def admin_ride_detail(ride_id: str, admin=Depends(get_admin_user)):
    ride = await database.find_one("rides", {"id": ride_id})
    if not ride or not _is_real_ride(ride):
        api_error("Ride not found.", 404)
    ride_requests = [await _enrich_admin_request(request) for request in await database.find_many("ride_requests", {"ride_id": ride_id})]
    support_cases = [
        message
        for message in await database.find_many("support_messages")
        if message.get("ride_id") == ride_id or message.get("request_id") in {request.get("id") for request in ride_requests}
    ]
    safety_reports = [
        report
        for report in await database.find_many("reports")
        if report.get("ride_id") == ride_id or report.get("request_id") in {request.get("id") for request in ride_requests}
    ]
    conversations = await database.find_many("conversations", {"ride_id": ride_id})
    return api_success(
        {
            "ride": await _enrich_admin_ride(ride, ride_requests),
            "requests": _sort_recent(ride_requests, 40),
            "support_cases": _sort_recent(support_cases, 20),
            "safety_reports": _sort_recent(safety_reports, 20),
            "conversation_count": len(conversations),
        }
    )


@router.patch("/rides/{ride_id}/status")
async def update_ride_status(
    ride_id: str,
    payload: RideUpdateBody,
    reason: Optional[str] = Query(default=None),
    admin=Depends(get_admin_user),
):
    updates = {key: value for key, value in payload.model_dump().items() if value is not None}
    if not updates:
        api_error("No ride updates provided.", 400)
    if updates.get("status") == "cancelled" and not reason:
        api_error("Admin cancellation reason is required.", 400)
    updates["updated_at"] = now_iso()
    ride = await database.update_one("rides", ride_id, updates)
    if not ride:
        api_error("Ride not found.", 404)
    await write_audit_log(
        actor_user_id=admin["id"],
        actor_role=admin.get("role"),
        action="admin_ride_updated",
        target_type="ride",
        target_id=ride_id,
        metadata={**updates, "reason": reason},
    )
    return api_success(ride)


@router.get("/requests")
async def admin_requests(
    search: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=250),
    admin=Depends(get_admin_user),
):
    requests = await database.find_many("ride_requests")
    rows = []
    for request in requests:
        enriched = await _enrich_admin_request(request)
        if status and request.get("status") != status:
            continue
        if not _contains_search(
            {
                **enriched,
                "route": _request_route(enriched),
                "driver_name": enriched.get("driver_name"),
                "passenger_name": enriched.get("passenger_name"),
            },
            search,
            ["passenger_name", "driver_name", "passenger_email", "driver_email", "route", "status"],
        ):
            continue
        rows.append(enriched)
    return api_success({"count": len(rows), "items": _sort_recent(rows, limit)})


@router.get("/requests/{request_id}")
async def admin_request_detail(request_id: str, admin=Depends(get_admin_user)):
    request = await database.find_one("ride_requests", {"id": request_id})
    if not request:
        api_error("Ride request not found.", 404)
    conversations = await database.find_many("conversations", {"request_id": request_id})
    messages = []
    for conversation in conversations:
        messages.extend(await database.find_many("messages", {"conversation_id": conversation.get("id")}))
    support_cases = await database.find_many("support_messages", {"request_id": request_id})
    safety_reports = await database.find_many("reports", {"request_id": request_id})
    return api_success(
        {
            "request": await _enrich_admin_request(request),
            "conversations": conversations,
            "message_count": len(messages),
            "support_cases": _sort_recent(support_cases, 20),
            "safety_reports": _sort_recent(safety_reports, 20),
        }
    )


@router.patch("/requests/{request_id}/status")
async def update_request_status(request_id: str, payload: RideRequestUpdateBody, admin=Depends(get_admin_user)):
    existing = await database.find_one("ride_requests", {"id": request_id})
    if not existing:
        api_error("Ride request not found.", 404)
    if payload.status in {"confirmed", "declined"}:
        api_error("Drivers approve or decline passenger requests. Admin can only intervene for safety or support.", 403)
    if payload.status != "cancelled_by_admin":
        api_error("Unsupported admin request action.", 400)
    if not payload.reason:
        api_error("Admin cancellation reason is required.", 400)
    ride = await database.find_one("rides", {"id": existing.get("ride_id")})
    if existing.get("status") == "confirmed" and ride:
        await database.update_one(
            "rides",
            ride["id"],
            {
                "available_seats": int(ride.get("available_seats", 0)) + int(existing.get("seats", 1)),
                "updated_at": now_iso(),
            },
        )
    request = await database.update_one(
        "ride_requests",
        request_id,
        {"status": "cancelled_by_admin", "admin_cancellation_reason": payload.reason, "updated_at": now_iso()},
    )
    if existing.get("user_id"):
        await create_app_notification(
            existing["user_id"],
            "admin_booking_update",
            "Booking updated",
            "Your booking was updated by LetsGoRide support. Open the app for details.",
            {"ride_id": existing.get("ride_id"), "request_id": request_id},
        )
    await write_audit_log(
        actor_user_id=admin["id"],
        actor_role=admin.get("role"),
        action="admin_request_status_changed",
        target_type="ride_request",
        target_id=request_id,
        metadata={"status": payload.status, "reason": payload.reason},
    )
    return api_success(request)


@router.get("/support/messages")
async def admin_support_messages(
    search: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=250),
    admin=Depends(get_admin_user),
):
    messages = await database.find_many("support_messages", {"status": status} if status else None)
    rows = [
        message
        for message in messages
        if _contains_search(message, search, ["subject", "message", "user_name", "user_email", "user_phone", "status"])
    ]
    return api_success({"count": len(rows), "items": _sort_recent(rows, limit)})


@router.get("/support/messages/{message_id}")
async def admin_support_message_detail(message_id: str, admin=Depends(get_admin_user)):
    message = await database.find_one("support_messages", {"id": message_id})
    if not message:
        api_error("Support message not found.", 404)
    user = await database.find_one("users", {"id": message.get("user_id")}) if message.get("user_id") else None
    ride = await database.find_one("rides", {"id": message.get("ride_id")}) if message.get("ride_id") else None
    request = await database.find_one("ride_requests", {"id": message.get("request_id")}) if message.get("request_id") else None
    return api_success(
        {
            "message": message,
            "user": public_user(user) if user else None,
            "ride": await _enrich_admin_ride(ride) if ride else None,
            "request": await _enrich_admin_request(request) if request else None,
        }
    )


@router.patch("/support/messages/{message_id}/status")
async def update_support_message_status(
    message_id: str,
    status: str = Query(...),
    admin_notes: Optional[str] = Query(default=None),
    admin=Depends(get_admin_user),
):
    if status not in {"received", "open", "in_review", "resolved", "closed"}:
        api_error("Unsupported support status.", 400)
    updates = {"status": status, "updated_at": now_iso()}
    if admin_notes:
        updates["admin_notes"] = admin_notes
    message = await database.update_one("support_messages", message_id, updates)
    if not message:
        api_error("Support message not found.", 404)
    if message.get("user_id"):
        await create_app_notification(
            message["user_id"],
            "support_reply",
            "Support replied",
            "LetsGoRide support replied to your message." if admin_notes else "Your support case status has been updated.",
            {"support_message_id": message_id},
        )
    await write_audit_log(
        actor_user_id=admin["id"],
        actor_role=admin.get("role"),
        action="admin_support_status_changed",
        target_type="support_message",
        target_id=message_id,
        metadata={"status": status, "admin_notes": admin_notes},
    )
    return api_success(message)


@router.get("/reports")
async def admin_reports(
    search: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=250),
    admin=Depends(get_admin_user),
):
    reports = await database.find_many("reports", {"status": status} if status else None)
    rows = [
        report
        for report in reports
        if _contains_search(report, search, ["report_type", "message", "user_name", "user_email", "user_phone", "status"])
    ]
    return api_success({"count": len(rows), "items": _sort_recent(rows, limit)})


@router.get("/reports/{report_id}")
async def admin_report_detail(report_id: str, admin=Depends(get_admin_user)):
    report = await database.find_one("reports", {"id": report_id})
    if not report:
        api_error("Report not found.", 404)
    user = await database.find_one("users", {"id": report.get("user_id")}) if report.get("user_id") else None
    ride = await database.find_one("rides", {"id": report.get("ride_id")}) if report.get("ride_id") else None
    request = await database.find_one("ride_requests", {"id": report.get("request_id")}) if report.get("request_id") else None
    reported_user = await database.find_one("users", {"id": report.get("reported_user_id")}) if report.get("reported_user_id") else None
    return api_success(
        {
            "report": report,
            "reporter": public_user(user) if user else None,
            "reported_user": public_user(reported_user) if reported_user else None,
            "ride": await _enrich_admin_ride(ride) if ride else None,
            "request": await _enrich_admin_request(request) if request else None,
        }
    )


@router.patch("/reports/{report_id}/status")
async def update_report_status(
    report_id: str,
    status: str = Query(...),
    admin_notes: Optional[str] = Query(default=None),
    admin=Depends(get_admin_user),
):
    if status not in {"submitted", "open", "in_review", "resolved", "dismissed"}:
        api_error("Unsupported report status.", 400)
    updates = {"status": status, "updated_at": now_iso()}
    if admin_notes:
        updates["admin_notes"] = admin_notes
    report = await database.update_one("reports", report_id, updates)
    if not report:
        api_error("Report not found.", 404)
    if report.get("user_id"):
        await create_app_notification(
            report["user_id"],
            "safety_report_updated",
            "Safety report updated",
            "Your safety report status has been updated.",
            {"report_id": report_id},
        )
    await write_audit_log(
        actor_user_id=admin["id"],
        actor_role=admin.get("role"),
        action="admin_report_status_changed",
        target_type="report",
        target_id=report_id,
        metadata={"status": status, "admin_notes": admin_notes},
    )
    return api_success(report)


@router.get("/audit-logs")
async def admin_audit_logs(
    action: Optional[str] = Query(default=None),
    target_type: Optional[str] = Query(default=None),
    limit: int = Query(default=60, ge=1, le=200),
    admin=Depends(get_admin_user),
):
    logs = await database.find_many("audit_logs")
    rows = []
    for log in logs:
        if action and log.get("action") != action:
            continue
        if target_type and log.get("target_type") != target_type:
            continue
        safe_log = dict(log)
        metadata = dict(safe_log.get("metadata") or {})
        for key in list(metadata.keys()):
            if key.lower() in {"password", "token", "otp", "code", "api_key", "authorization"}:
                metadata[key] = "[redacted]"
        safe_log["metadata"] = metadata
        rows.append(safe_log)
    return api_success({"count": len(rows), "items": _sort_recent(rows, limit)})


@router.get("/verifications")
async def list_verifications(
    status: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    admin=Depends(get_admin_user),
):
    drivers = await database.find_many("drivers")
    rows = []
    for driver in drivers:
        verification_status = public_verification_status(driver)
        if status and verification_status != status:
            continue
        documents = manual_verification_documents(driver.get("documents", []))
        row = {
            "driver_id": driver.get("id"),
            "name": driver.get("name"),
            "phone": driver.get("phone"),
            "email": driver.get("email"),
            "city": driver.get("city"),
            "driver_status": driver.get("status"),
            "verification_status": verification_status,
            "verification_provider": "manual",
            "verification_submitted_at": driver.get("verification_submitted_at"),
            "document_count": len(documents),
            "created_at": driver.get("created_at"),
            "updated_at": driver.get("updated_at"),
        }
        if not _contains_search(row, search, ["name", "email", "phone", "city", "verification_status"]):
            continue
        rows.append(row)
    status_order = {
        "pending_uploads": 0,
        "pending_auto_check": 1,
        "needs_review": 2,
        "needs_resubmission": 3,
        "rejected": 4,
        "approved": 5,
        "active": 6,
        "not_started": 7,
    }
    rows = sorted(
        rows,
        key=lambda item: (
            status_order.get(item.get("verification_status", "not_started"), 9),
            item.get("verification_submitted_at") or item.get("updated_at") or "",
        ),
        reverse=False,
    )
    return api_success({"count": len(rows), "items": rows})


@router.get("/verifications/{driver_id}")
async def verification_detail(driver_id: str, admin=Depends(get_admin_user)):
    driver = await database.find_one("drivers", {"id": driver_id})
    if not driver:
        api_error("Verification submission not found.", 404)
    user = await database.find_one("users", {"id": driver.get("user_id")}) if driver.get("user_id") else None
    vehicles = await database.find_many("vehicles", {"driver_id": driver_id})
    documents = [_public_document(document) for document in manual_verification_documents(driver.get("documents", []))]
    public_driver = dict(driver)
    public_driver["documents"] = documents
    public_driver["verification_status"] = public_verification_status(driver)
    public_driver["verification_provider"] = "manual"
    return api_success(
        {
            "driver": public_driver,
            "user": public_user(user) if user else None,
            "vehicles": vehicles,
            "documents": documents,
        }
    )


@router.patch("/verifications/{driver_id}/status")
async def update_verification_status(
    driver_id: str,
    payload: VerificationStatusUpdateBody,
    admin=Depends(get_admin_user),
):
    driver = await database.find_one("drivers", {"id": driver_id})
    if not driver:
        api_error("Verification submission not found.", 404)
    updated = await apply_admin_verification_status(
        admin=admin,
        driver=driver,
        status=payload.status,
        admin_notes=payload.admin_verification_notes,
        rejection_reason=payload.rejection_reason,
        document_id=payload.document_id,
        document_status=payload.document_status,
    )
    return api_success(updated)


@router.get("/verifications/{driver_id}/documents/{document_id}")
async def verification_document(driver_id: str, document_id: str, admin=Depends(_get_admin_from_header_or_query)):
    driver = await database.find_one("drivers", {"id": driver_id})
    if not driver:
        logger.warning("action=admin_document_view verification_id=%s document_id=%s admin_user_id=%s status_code=404 file_found=false content_type=none", driver_id, document_id, admin.get("id"))
        api_error("Verification submission not found.", 404)
    document = next((item for item in manual_verification_documents(driver.get("documents", [])) if item.get("id") == document_id), None)
    if not document:
        logger.warning("action=admin_document_view verification_id=%s document_id=%s admin_user_id=%s status_code=404 file_found=false content_type=none", driver_id, document_id, admin.get("id"))
        api_error("Document not found.", 404)
    storage_path = document.get("storage_path")
    if not storage_path:
        logger.warning("action=admin_document_view verification_id=%s document_id=%s admin_user_id=%s status_code=404 file_found=false content_type=none", driver_id, document_id, admin.get("id"))
        api_error("Document file is unavailable on the server. The user may need to re-upload.", 404)
    path = Path(storage_path)
    if not path.exists() or not path.is_file():
        logger.warning("action=admin_document_view verification_id=%s document_id=%s admin_user_id=%s status_code=404 file_found=false content_type=none", driver_id, document_id, admin.get("id"))
        api_error("Document file is unavailable on the server. The user may need to re-upload.", 404)
    media_type = mimetypes.guess_type(document.get("file_name") or str(path))[0] or "application/octet-stream"
    logger.info("action=admin_document_view verification_id=%s document_id=%s admin_user_id=%s status_code=200 file_found=true content_type=%s", driver_id, document_id, admin.get("id"), media_type)
    return FileResponse(
        path,
        media_type=media_type,
        filename=document.get("file_name") or "verification-document",
    )


@router.get("/verifications/{driver_id}/documents/{document_id}/view")
async def verification_document_view(driver_id: str, document_id: str, admin=Depends(_get_admin_from_header_or_query)):
    return await verification_document(driver_id, document_id, admin)


@router.delete("/rides/demo")
async def delete_demo_rides(admin=Depends(get_admin_user)):
    result = await cleanup_demo_rides()
    await write_audit_log(
        actor_user_id=admin["id"],
        actor_role=admin.get("role"),
        action="demo_rides_cleanup",
        target_type="rides",
        target_id="demo",
        metadata=result,
    )
    return api_success(result)
