import asyncio
import mimetypes
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import FileResponse, Response

from app.auth import get_admin_user
from app.database import database
from app.models.verification import VerificationStatusUpdateBody
from app.models.request import RideRequestUpdateBody
from app.models.ride import AdminRideStatusBody
from app.models.user import AdminRoleUpdateBody
from app.services.admin_bounded_read_service import (
    list_admin_audit_logs,
    list_admin_reports,
    list_admin_support_messages,
)
from app.services.admin_read_service import (
    enrich_admin_request,
    enrich_admin_requests,
    enrich_admin_ride,
    enrich_admin_rides,
    enrich_admin_user,
)
from app.services.admin_ride_request_list_service import (
    list_admin_requests,
    list_admin_rides,
)
from app.services.admin_user_list_service import list_admin_users
from app.services.audit_service import write_audit_log
from app.services.auth_service import public_user
from app.services.notification_service import create_app_notification
from app.services.data_retention_consistency_service import (
    actionable_shared_ride_request_counts,
    active_verified_driver_count,
)
from app.services.ride_service import canonical_trip_status, is_final_trip_status
from app.services.ride_realtime_service import publish_ride_realtime, ride_event_type, update_versioned_ride
from app.services.ride_request_realtime_service import publish_ride_request_realtime, ride_request_event_type, update_versioned_ride_request
from app.services.verification_service import (
    apply_admin_verification_status,
    manual_verification_documents,
    public_verification_status,
)
from app.services.private_document_service import contained_legacy_document_path, private_document_service, private_provider_document_bytes
from app.services.work_product_service import approved_work_products, with_approved_work_product
from app.utils import api_error, api_success, now_iso


router = APIRouter(prefix="/admin", tags=["admin"])
logger = logging.getLogger(__name__)

VERIFIED_DRIVER_VERIFICATION_STATUSES = {"approved", "verified", "active"}
PENDING_DRIVER_VERIFICATION_STATUSES = {
    "pending",
    "pending_uploads",
    "pending_auto_check",
    "needs_review",
    "needs_resubmission",
}


def _is_verified_driver_verification(status: Optional[str]) -> bool:
    return str(status or "").strip().lower() in VERIFIED_DRIVER_VERIFICATION_STATUSES


def _is_pending_driver_verification(status: Optional[str]) -> bool:
    return str(status or "").strip().lower() in PENDING_DRIVER_VERIFICATION_STATUSES


def _public_document(document):
    return {
        "id": document.get("id"),
        "document_type": document.get("document_type"),
        "file_name": document.get("file_name"),
        "has_file": bool(document.get("cloudinary_public_id") or (document.get("legacy_local_document") is True and document.get("storage_path"))),
        "uploaded_at": document.get("uploaded_at"),
        "status": document.get("status", "pending"),
        "rejection_reason": document.get("rejection_reason"),
        "content_type": document.get("content_type") or mimetypes.guess_type(document.get("file_name") or "")[0],
        "ocr": document.get("ocr") if isinstance(document.get("ocr"), dict) else None,
    }


def _sort_recent(rows: List[Dict[str, Any]], limit: int = 10) -> List[Dict[str, Any]]:
    return sorted(rows, key=lambda row: row.get("created_at") or row.get("updated_at") or "", reverse=True)[:limit]


def _contains_search(row: Dict[str, Any], search: Optional[str], fields: List[str]) -> bool:
    if not search:
        return True
    term = search.strip().lower()
    return any(term in str(row.get(field) or "").lower() for field in fields)


def _status_tone(status: Optional[str]) -> str:
    normalized = str(status or "").strip().lower()
    if _is_verified_driver_verification(normalized) or normalized in {"confirmed", "resolved", "open", "completed"}:
        return "success"
    if normalized in {"rejected", "cancelled", "cancelled_by_admin", "cancelled_by_driver", "cancelled_by_passenger", "suspended", "deleted", "dismissed"}:
        return "danger"
    if _is_pending_driver_verification(normalized) or normalized in {"submitted", "received", "in_review", "declined", "closed"}:
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


def _related_ride_filter(ride_id: str, request_ids: List[str]) -> Dict[str, Any]:
    clauses: List[Dict[str, Any]] = [{"ride_id": ride_id}]
    if request_ids:
        clauses.append({"request_id": {"$in": request_ids}})
    return clauses[0] if len(clauses) == 1 else {"$or": clauses}


@router.get("/overview")
async def overview(admin=Depends(get_admin_user)):
    pending_filter = {
        "verification_status": {"$in": sorted(PENDING_DRIVER_VERIFICATION_STATUSES)}
    }
    active_ride_statuses = [
        "SCHEDULED", "BOARDING", "IN_PROGRESS", "OPEN", "DEPARTED",
        "scheduled", "boarding", "in_progress", "open", "departed",
    ]

    (
        user_count,
        ride_count,
        request_count,
        verified_driver_count,
        pending_verification_count,
        active_ride_count,
        actionable_request_counts,
        support_count,
        open_support_count,
        report_count,
        open_report_count,
        unread_notification_count,
        recent_requests,
        recent_drivers,
        recent_support,
        recent_reports,
    ) = await asyncio.gather(
        database.count("users"),
        database.count("rides"),
        database.count("ride_requests"),
        active_verified_driver_count(),
        database.count("drivers", pending_filter),
        database.count("rides", {"status": {"$in": active_ride_statuses}}),
        actionable_shared_ride_request_counts(),
        database.count("support_messages"),
        database.count("support_messages", {"status": {"$nin": ["resolved", "closed"]}}),
        database.count("reports"),
        database.count("reports", {"status": {"$nin": ["resolved", "dismissed"]}}),
        database.count("app_notifications", {"user_id": admin["id"], "read": {"$ne": True}}),
        database.find_many("ride_requests", sort=[("updated_at", -1)], limit=8),
        database.find_many("drivers", sort=[("updated_at", -1)], limit=8),
        database.find_many("support_messages", sort=[("updated_at", -1)], limit=6),
        database.find_many("reports", sort=[("updated_at", -1)], limit=6),
    )
    pending_request_count = actionable_request_counts["pending"]
    confirmed_booking_count = actionable_request_counts["confirmed"]

    activities = []
    for request in recent_requests:
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
    for driver in recent_drivers:
        verification_status = public_verification_status(driver)
        if _is_pending_driver_verification(verification_status) or _is_verified_driver_verification(verification_status) or verification_status == "rejected":
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
    for message in recent_support:
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
    for report in recent_reports:
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

    return api_success(
        {
            "users": user_count,
            "total_users": user_count,
            "verified_drivers": verified_driver_count,
            "pending_verifications": pending_verification_count,
            "pending_driver_verifications": pending_verification_count,
            "rides": ride_count,
            "active_rides": active_ride_count,
            "requests": request_count,
            "pending_ride_requests": pending_request_count,
            "confirmed_bookings": confirmed_booking_count,
            "support_messages": support_count,
            "open_support_cases": open_support_count,
            "safety_reports": report_count,
            "open_safety_reports": open_report_count,
            "unread_admin_notifications": unread_notification_count,
            "recent_activity": _sort_recent(activities, 12),
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
    return api_success(
        await list_admin_users(
            search=search,
            role=role,
            status=status,
            verification=verification,
            limit=limit,
        )
    )


@router.get("/users/{user_id}")
async def user_detail(user_id: str, admin=Depends(get_admin_user)):
    user = await database.find_one("users", {"id": user_id})
    if not user:
        api_error("User not found.", 404)
    rides_raw, requests_raw, support_cases, safety_reports, driver = await asyncio.gather(
        database.find_many("rides", {"user_id": user_id}),
        database.find_many("ride_requests", {"user_id": user_id}),
        database.find_many("support_messages", {"user_id": user_id}),
        database.find_many("reports", {"user_id": user_id}),
        database.find_one("drivers", {"user_id": user_id}),
    )
    rides, requests, enriched_user = await asyncio.gather(
        enrich_admin_rides(rides_raw),
        enrich_admin_requests(requests_raw),
        enrich_admin_user(user),
    )
    return api_success(
        {
            "user": enriched_user,
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


@router.patch("/users/{user_id}/role")
async def provision_user_product_role(
    user_id: str,
    payload: AdminRoleUpdateBody,
    admin=Depends(get_admin_user),
):
    if user_id == admin.get("id"):
        api_error("Use a different administrator to change your own access.", 400)
    existing = await database.find_one("users", {"id": user_id})
    if not existing:
        api_error("User not found.", 404)
    previous_role = str(existing.get("role") or "passenger").strip().lower()
    updates: Dict[str, Any] = {"updated_at": now_iso()}

    if payload.role in {"driver", "courier"}:
        if previous_role not in {"passenger", "driver", "courier"}:
            api_error("This account already belongs to an incompatible product role.", 409)
        if payload.role == "driver":
            profile = await database.find_one("drivers", {"user_id": user_id})
            verification_status = public_verification_status(profile or {})
            if not profile or not (
                profile.get("verified") is True
                or verification_status in VERIFIED_DRIVER_VERIFICATION_STATUSES
            ):
                api_error("Approve the Driver application before granting Driver access.", 409)
        else:
            profile = await database.find_one("courier_profiles", {"user_id": user_id})
            if not profile or str(profile.get("status") or "").upper() != "APPROVED":
                api_error("Approve the Courier application before granting Courier access.", 409)
        products = with_approved_work_product(existing, payload.role)
        updates["work_products"] = products
        updates["role"] = payload.role if previous_role == "passenger" else previous_role
    else:
        products = approved_work_products(existing)
        if products:
            api_error("Remove Driver or Courier access before assigning an incompatible product role.", 409)
        updates["role"] = payload.role

    updated = await database.update_one("users", user_id, updates)
    await write_audit_log(
        actor_user_id=admin["id"],
        actor_role=admin.get("role"),
        action="admin_product_role_provisioned",
        target_type="user",
        target_id=user_id,
        metadata={
            "from_role": previous_role,
            "to_role": updates.get("role"),
            "granted_product": payload.role if payload.role in {"driver", "courier"} else None,
            "work_products": updates.get("work_products", approved_work_products(existing)),
            "reason": payload.reason,
        },
    )
    return api_success(public_user(updated or {**existing, **updates}))


@router.get("/rides")
async def admin_rides(
    search: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    filter: Optional[str] = Query(default=None),
    limit: int = Query(default=80, ge=1, le=200),
    admin=Depends(get_admin_user),
):
    return api_success(
        await list_admin_rides(
            search=search,
            status=status,
            filter_name=filter,
            limit=limit,
        )
    )


@router.get("/rides/{ride_id}")
async def admin_ride_detail(ride_id: str, admin=Depends(get_admin_user)):
    ride = await database.find_one("rides", {"id": ride_id})
    if not ride:
        api_error("Ride not found.", 404)
    raw_requests = await database.find_many("ride_requests", {"ride_id": ride_id})
    request_ids = [str(request.get("id")) for request in raw_requests if request.get("id")]
    related_filter = _related_ride_filter(ride_id, request_ids)
    ride_requests, support_cases, safety_reports, conversations, enriched_ride = await asyncio.gather(
        enrich_admin_requests(raw_requests),
        database.find_many("support_messages", related_filter),
        database.find_many("reports", related_filter),
        database.find_many("conversations", {"ride_id": ride_id}),
        enrich_admin_ride(ride, raw_requests),
    )
    return api_success(
        {
            "ride": enriched_ride,
            "requests": _sort_recent(ride_requests, 40),
            "support_cases": _sort_recent(support_cases, 20),
            "safety_reports": _sort_recent(safety_reports, 20),
            "conversation_count": len(conversations),
        }
    )


@router.patch("/rides/{ride_id}/status")
async def update_ride_status(
    ride_id: str,
    payload: AdminRideStatusBody,
    reason: Optional[str] = Query(default=None),
    admin=Depends(get_admin_user),
):
    target_status = canonical_trip_status(payload.status)
    existing = await database.find_one("rides", {"id": ride_id})
    if not existing:
        api_error("Ride not found.", 404)
    current_status = canonical_trip_status(existing.get("status"))
    allowed_transitions = {
        "SCHEDULED": {"BOARDING", "IN_PROGRESS", "COMPLETED", "CANCELLED", "EXPIRED"},
        "BOARDING": {"IN_PROGRESS", "COMPLETED", "CANCELLED", "EXPIRED"},
        "IN_PROGRESS": {"COMPLETED", "CANCELLED"},
        "COMPLETED": set(),
        "CANCELLED": set(),
        "EXPIRED": set(),
    }
    if target_status != current_status and target_status not in allowed_transitions.get(current_status, set()):
        api_error("This ride status transition is not allowed.", 400)
    if target_status == current_status:
        return api_success(existing)
    if target_status == "CANCELLED" and not reason:
        api_error("Admin cancellation reason is required.", 400)
    updates = {"status": target_status, "updated_at": now_iso()}
    if is_final_trip_status(target_status):
        updates["live_tracking_enabled"] = False
    if target_status == "CANCELLED":
        updates["cancelled_at"] = now_iso()
    ride = await update_versioned_ride(
        {"id": ride_id, "status": existing.get("status")},
        updates,
    )
    if not ride:
        api_error("Ride changed while it was being updated. Refresh and try again.", 409)
    await publish_ride_realtime(ride, ride_event_type(ride))
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
    return api_success(
        await list_admin_requests(
            search=search,
            status=status,
            limit=limit,
        )
    )


@router.get("/requests/{request_id}")
async def admin_request_detail(request_id: str, admin=Depends(get_admin_user)):
    request = await database.find_one("ride_requests", {"id": request_id})
    if not request:
        api_error("Ride request not found.", 404)
    conversations, support_cases, safety_reports, enriched_request = await asyncio.gather(
        database.find_many("conversations", {"request_id": request_id}),
        database.find_many("support_messages", {"request_id": request_id}),
        database.find_many("reports", {"request_id": request_id}),
        enrich_admin_request(request),
    )
    conversation_ids = [
        str(conversation.get("id"))
        for conversation in conversations
        if conversation.get("id")
    ]
    messages = await database.find_many(
        "messages",
        {"conversation_id": {"$in": conversation_ids}},
    ) if conversation_ids else []
    return api_success(
        {
            "request": enriched_request,
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
    if existing.get("status") == "cancelled_by_admin":
        return api_success(existing)
    timestamp = now_iso()
    request = await update_versioned_ride_request(
        {"id": request_id, "status": existing.get("status")},
        {"status": "cancelled_by_admin", "admin_cancellation_reason": payload.reason, "updated_at": now_iso()},
    )
    if not request:
        api_error("Ride request changed while it was being updated. Refresh and try again.", 409)
    updated_ride = ride
    if existing.get("status") == "confirmed" and ride:
        updated_ride = await update_versioned_ride(
            {"id": ride["id"]},
            {"updated_at": timestamp},
            {"available_seats": int(existing.get("seats", 1))},
        ) or ride
    if ride:
        await publish_ride_request_realtime(request, updated_ride or ride, ride_request_event_type(request))
    if updated_ride is not ride and updated_ride:
        await publish_ride_realtime(updated_ride, "ride.updated")
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
    rows = await list_admin_support_messages(search=search, status=status, limit=limit)
    return api_success({"count": len(rows), "items": rows})


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
            "ride": await enrich_admin_ride(ride) if ride else None,
            "request": await enrich_admin_request(request) if request else None,
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
    rows = await list_admin_reports(search=search, status=status, limit=limit)
    return api_success({"count": len(rows), "items": rows})


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
            "ride": await enrich_admin_ride(ride) if ride else None,
            "request": await enrich_admin_request(request) if request else None,
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
    logs = await list_admin_audit_logs(action=action, target_type=target_type, limit=limit)
    rows = []
    for log in logs:
        safe_log = dict(log)
        metadata = dict(safe_log.get("metadata") or {})
        for key in list(metadata.keys()):
            if key.lower() in {"password", "token", "otp", "code", "api_key", "authorization"}:
                metadata[key] = "[redacted]"
        safe_log["metadata"] = metadata
        rows.append(safe_log)
    return api_success({"count": len(rows), "items": rows})


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
            "risk_score": driver.get("risk_score", driver.get("verification_risk_score")),
            "risk_level": driver.get("risk_level"),
            "risk_flags": driver.get("risk_flags", driver.get("verification_risk_flags", [])),
            "duplicate_flags": driver.get("duplicate_flags", []),
            "review_reasons": driver.get("review_reasons", []),
            "face_match_status": driver.get("face_match_status"),
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


@router.post("/verifications/{driver_id}/documents/{document_id}/access")
async def verification_document_access(driver_id: str, document_id: str, admin=Depends(get_admin_user)):
    driver = await database.find_one("drivers", {"id": driver_id})
    document = next((item for item in manual_verification_documents((driver or {}).get("documents", [])) if item.get("id") == document_id), None)
    if not document:
        api_error("Document not found.", 404)
    token = await private_document_service.issue(actor_id=str(admin["id"]), collection="drivers", owner_id=driver_id, document_id=document_id)
    return api_success({"url": f"/admin/verifications/{driver_id}/documents/{document_id}/view?document_token={token}"})


@router.get("/verifications/{driver_id}/documents/{document_id}")
async def verification_document(driver_id: str, document_id: str, admin=Depends(get_admin_user)):
    driver = await database.find_one("drivers", {"id": driver_id})
    if not driver:
        logger.warning("action=admin_document_view status_code=404 file_found=false error_category=owner_missing")
        api_error("Verification submission not found.", 404)
    document = next((item for item in manual_verification_documents(driver.get("documents", [])) if item.get("id") == document_id), None)
    if not document:
        logger.warning("action=admin_document_view status_code=404 file_found=false error_category=document_missing")
        api_error("Document not found.", 404)
    if document.get("cloudinary_public_id"):
        try:
            content, media_type = await asyncio.to_thread(private_provider_document_bytes, document)
        except Exception:
            api_error("Document file is unavailable. The user may need to re-upload.", 404)
        download_name = "".join(character for character in str(document.get("file_name") or "verification-document") if character.isalnum() or character in ".-_") or "verification-document"
        return Response(content=content, media_type=media_type, headers={"Content-Disposition": f'inline; filename="{download_name}"', "Cache-Control": "no-store"})
    if document.get("legacy_local_document") is not True:
        logger.warning("action=admin_document_view status_code=404 file_found=false error_category=secure_reference_missing")
        api_error("Document file is unavailable on the server. The user may need to re-upload.", 404)
    try:
        path = contained_legacy_document_path(document)
    except (FileNotFoundError, OSError):
        logger.warning("action=admin_document_view status_code=404 file_found=false error_category=legacy_file_unavailable")
        api_error("Document file is unavailable on the server. The user may need to re-upload.", 404)
    media_type = mimetypes.guess_type(document.get("file_name") or str(path))[0] or "application/octet-stream"
    logger.info("action=admin_document_view status_code=200 file_found=true content_type=%s", media_type)
    return FileResponse(
        path,
        media_type=media_type,
        filename=document.get("file_name") or "verification-document",
    )


@router.get("/verifications/{driver_id}/documents/{document_id}/view")
async def verification_document_view(driver_id: str, document_id: str, document_token: str = Query(default="")):
    ticket = await private_document_service.consume(document_token)
    if not ticket or ticket.get("collection") != "drivers" or ticket.get("owner_id") != driver_id or ticket.get("document_id") != document_id:
        api_error("This document link is invalid or expired.", 401)
    admin = await database.find_one("users", {"id": ticket["actor_id"]})
    if not admin or admin.get("role") != "admin":
        api_error("Admin access is required.", 403)
    return await verification_document(driver_id, document_id, admin)
