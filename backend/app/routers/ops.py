import asyncio
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, Query

from app.database import database
from app.models.ops import (
    OpsCaseAssignBody,
    OpsCaseCreateBody,
    OpsCaseEscalateBody,
    OpsCaseNoteBody,
    OpsCaseStatusBody,
    OpsReportStatusBody,
    OpsStaffProvisionBody,
    OpsStaffUpdateBody,
    OpsSupportStatusBody,
)
from app.services.audit_service import write_audit_log
from app.services.auth_service import public_user
from app.services.notification_service import create_app_notification
from app.services.ops_access_service import (
    OPS_ROLE_LEVELS,
    can_work_case,
    get_ops_admin,
    get_ops_manager,
    get_ops_user,
    public_staff_identity,
)
from app.utils import api_error, api_success, new_id, now_iso


router = APIRouter(prefix="/ops", tags=["operations-control-center"])

CASE_LEVEL_ORDER = ["cs", "manager", "admin"]
CASE_OPEN_STATUSES = {"open", "in_progress", "waiting_customer", "escalated"}
FINAL_HAILING_STATUSES = {
    "COMPLETED",
    "CANCELLED",
    "CANCELLED_BY_PASSENGER",
    "CANCELLED_BY_DRIVER",
    "EXPIRED",
    "completed",
    "cancelled",
    "expired",
}
FINAL_COURIER_STATUSES = {"DELIVERED", "COMPLETED", "CANCELLED", "delivered", "completed", "cancelled"}
FINAL_FOOD_STATUSES = {"DELIVERED", "COMPLETED", "CANCELLED", "delivered", "completed", "cancelled"}

SOURCE_COLLECTIONS = {
    "support_message": "support_messages",
    "safety_report": "reports",
    "shared_ride": "rides",
    "ride_request": "ride_requests",
    "hailing_trip": "hailing_trips",
    "courier_delivery": "courier_deliveries",
    "food_order": "food_orders",
    "user": "users",
}


def _contains(row: Dict[str, Any], search: Optional[str], fields: List[str]) -> bool:
    term = str(search or "").strip().lower()
    if not term:
        return True
    return term in " ".join(str(row.get(field) or "") for field in fields).lower()


def _case_level(case: Dict[str, Any]) -> str:
    value = str(case.get("escalation_level") or "cs").strip().lower()
    return value if value in CASE_LEVEL_ORDER else "cs"


def _safe_case(case: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": case.get("id"),
        "case_number": case.get("case_number"),
        "subject": case.get("subject"),
        "description": case.get("description"),
        "priority": case.get("priority", "normal"),
        "status": case.get("status", "open"),
        "escalation_level": _case_level(case),
        "source_type": case.get("source_type", "manual"),
        "source_id": case.get("source_id"),
        "customer_user_id": case.get("customer_user_id"),
        "assigned_user_id": case.get("assigned_user_id"),
        "assigned_name": case.get("assigned_name"),
        "created_by_user_id": case.get("created_by_user_id"),
        "created_at": case.get("created_at"),
        "updated_at": case.get("updated_at"),
        "resolved_at": case.get("resolved_at"),
    }


def _safe_audit_log(row: Dict[str, Any]) -> Dict[str, Any]:
    safe = dict(row)
    metadata = dict(safe.get("metadata") or {})
    for key in list(metadata.keys()):
        if key.lower() in {"password", "token", "otp", "code", "api_key", "authorization", "secret"}:
            metadata[key] = "[redacted]"
    safe["metadata"] = metadata
    return safe


def _hailing_summary(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        key: row.get(key)
        for key in (
            "id", "status", "ride_class", "city_id", "passenger_user_id", "driver_user_id",
            "driver_id", "pickup_address", "dropoff_address", "pickup", "dropoff", "fare_usd",
            "estimated_fare", "created_at", "updated_at",
        )
        if key in row
    }


def _courier_summary(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        key: row.get(key)
        for key in (
            "id", "status", "sender_user_id", "customer_user_id", "courier_user_id", "pickup_address",
            "dropoff_address", "price_usd", "quoted_price_usd", "created_at", "updated_at",
        )
        if key in row
    }


def _food_summary(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        key: row.get(key)
        for key in (
            "id", "status", "customer_user_id", "restaurant_id", "courier_user_id", "total_usd",
            "total", "created_at", "updated_at",
        )
        if key in row
    }


def _ride_summary(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        key: row.get(key)
        for key in (
            "id", "user_id", "driver_name", "origin", "destination", "date", "time", "status",
            "available_seats", "created_at", "updated_at",
        )
        if key in row
    }


async def _source_record(source_type: str, source_id: Optional[str]) -> Optional[Dict[str, Any]]:
    if source_type == "manual":
        return None
    collection = SOURCE_COLLECTIONS.get(source_type)
    if not collection or not source_id:
        api_error("A valid source is required for this case type.", 400)
    source = await database.find_one(collection, {"id": source_id})
    if not source:
        api_error("The linked source record could not be found.", 404)
    return source


def _source_customer_user_id(source_type: str, source: Optional[Dict[str, Any]]) -> Optional[str]:
    if not source:
        return None
    if source_type in {"support_message", "safety_report", "ride_request", "user"}:
        return source.get("user_id") or source.get("id") if source_type == "user" else source.get("user_id")
    if source_type == "hailing_trip":
        return source.get("passenger_user_id")
    if source_type == "courier_delivery":
        return source.get("sender_user_id") or source.get("customer_user_id")
    if source_type == "food_order":
        return source.get("customer_user_id")
    return None


async def _case_event(
    case_id: str,
    actor: Dict[str, Any],
    action: str,
    *,
    note: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    event = {
        "id": new_id(),
        "case_id": case_id,
        "action": action,
        "actor_user_id": actor.get("id"),
        "actor_name": actor.get("name") or actor.get("email"),
        "actor_ops_role": actor.get("ops_role"),
        "note": note,
        "metadata": metadata or {},
        "created_at": now_iso(),
    }
    await database.insert_one("ops_case_events", event)
    await write_audit_log(
        actor_user_id=actor.get("id"),
        actor_role=f"ops:{actor.get('ops_role')}",
        action=f"ops_case_{action}",
        target_type="ops_case",
        target_id=case_id,
        metadata={"note": note, **(metadata or {})},
    )
    return event


async def _ops_role_for_user(target: Dict[str, Any]) -> Optional[str]:
    if target.get("role") == "admin":
        return "admin"
    staff = await database.find_one("ops_staff", {"user_id": target.get("id"), "enabled": {"$ne": False}})
    role = str((staff or {}).get("role") or "").strip().lower()
    return role if role in {"cs", "manager"} else None


async def _staff_row(staff: Dict[str, Any]) -> Dict[str, Any]:
    user = await database.find_one("users", {"id": staff.get("user_id")})
    return {
        "id": staff.get("id"),
        "user_id": staff.get("user_id"),
        "name": (user or {}).get("name"),
        "email": (user or {}).get("email"),
        "phone": (user or {}).get("phone"),
        "role": staff.get("role"),
        "title": staff.get("title"),
        "enabled": staff.get("enabled", True),
        "created_at": staff.get("created_at"),
        "updated_at": staff.get("updated_at"),
    }


@router.get("/me")
async def ops_me(user=Depends(get_ops_user)):
    return api_success(public_staff_identity(user))


@router.get("/overview")
async def overview(user=Depends(get_ops_user)):
    (
        total_users,
        open_support,
        open_reports,
        pending_verifications,
        open_cases,
        manager_cases,
        admin_cases,
        active_hailing,
        active_courier,
        active_food,
        recent_cases,
    ) = await asyncio.gather(
        database.count("users"),
        database.count("support_messages", {"status": {"$nin": ["resolved", "closed"]}}),
        database.count("reports", {"status": {"$nin": ["resolved", "dismissed"]}}),
        database.count("drivers", {"verification_status": {"$in": ["pending", "pending_uploads", "pending_auto_check", "needs_review", "needs_resubmission"]}}),
        database.count("ops_cases", {"status": {"$in": sorted(CASE_OPEN_STATUSES)}}),
        database.count("ops_cases", {"status": {"$in": sorted(CASE_OPEN_STATUSES)}, "escalation_level": "manager"}),
        database.count("ops_cases", {"status": {"$in": sorted(CASE_OPEN_STATUSES)}, "escalation_level": "admin"}),
        database.count("hailing_trips", {"status": {"$nin": sorted(FINAL_HAILING_STATUSES)}}),
        database.count("courier_deliveries", {"status": {"$nin": sorted(FINAL_COURIER_STATUSES)}}),
        database.count("food_orders", {"status": {"$nin": sorted(FINAL_FOOD_STATUSES)}}),
        database.find_many("ops_cases", sort=[("updated_at", -1)], limit=8),
    )
    return api_success({
        "staff_role": user.get("ops_role"),
        "total_users": total_users,
        "open_support_cases": open_support,
        "open_safety_reports": open_reports,
        "pending_driver_verifications": pending_verifications,
        "open_ops_cases": open_cases,
        "manager_escalations": manager_cases,
        "admin_escalations": admin_cases,
        "active_hailing_trips": active_hailing,
        "active_courier_deliveries": active_courier,
        "active_food_orders": active_food,
        "recent_cases": [_safe_case(row) for row in recent_cases],
    })


@router.get("/live")
async def live_operations(user=Depends(get_ops_user)):
    hailing, courier, food, rides = await asyncio.gather(
        database.find_many("hailing_trips", {"status": {"$nin": sorted(FINAL_HAILING_STATUSES)}}, sort=[("updated_at", -1)], limit=30),
        database.find_many("courier_deliveries", {"status": {"$nin": sorted(FINAL_COURIER_STATUSES)}}, sort=[("updated_at", -1)], limit=30),
        database.find_many("food_orders", {"status": {"$nin": sorted(FINAL_FOOD_STATUSES)}}, sort=[("updated_at", -1)], limit=30),
        database.find_many("rides", {"status": {"$nin": ["COMPLETED", "CANCELLED", "EXPIRED", "completed", "cancelled", "expired"]}}, sort=[("updated_at", -1)], limit=30),
    )
    return api_success({
        "hailing": [_hailing_summary(row) for row in hailing],
        "courier": [_courier_summary(row) for row in courier],
        "food": [_food_summary(row) for row in food],
        "shared_rides": [_ride_summary(row) for row in rides],
    })


@router.get("/users")
async def search_users(
    search: Optional[str] = Query(default=None),
    role: Optional[str] = Query(default=None),
    limit: int = Query(default=80, ge=1, le=200),
    user=Depends(get_ops_user),
):
    rows = await database.find_many("users", sort=[("updated_at", -1)], limit=limit)
    result = []
    for row in rows:
        if role and row.get("role") != role:
            continue
        if not _contains(row, search, ["name", "email", "phone", "city", "role", "status"]):
            continue
        safe = public_user(row)
        safe.pop("ops_role", None)
        safe.pop("ops_enabled", None)
        safe["operations_role"] = await _ops_role_for_user(row)
        result.append(safe)
    return api_success({"count": len(result), "items": result})


@router.get("/support/messages")
async def support_messages(
    status: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=250),
    user=Depends(get_ops_user),
):
    rows = await database.find_many("support_messages", {"status": status} if status else None, sort=[("updated_at", -1)], limit=limit)
    rows = [row for row in rows if _contains(row, search, ["subject", "message", "user_name", "user_email", "user_phone", "status"])]
    return api_success({"count": len(rows), "items": rows})


@router.patch("/support/messages/{message_id}")
async def update_support_message(message_id: str, payload: OpsSupportStatusBody, user=Depends(get_ops_user)):
    existing = await database.find_one("support_messages", {"id": message_id})
    if not existing:
        api_error("Support message not found.", 404)
    updates: Dict[str, Any] = {"status": payload.status, "updated_at": now_iso()}
    if payload.reply:
        updates["admin_notes"] = payload.reply
        updates["last_staff_reply_at"] = now_iso()
    updated = await database.update_one("support_messages", message_id, updates) or {**existing, **updates}
    if updated.get("user_id"):
        await create_app_notification(
            updated["user_id"],
            "support_reply",
            "Support replied" if payload.reply else "Support case updated",
            payload.reply or "Your LetsGoRide support case status has been updated.",
            {"support_message_id": message_id},
        )
    await write_audit_log(
        actor_user_id=user.get("id"),
        actor_role=f"ops:{user.get('ops_role')}",
        action="ops_support_updated",
        target_type="support_message",
        target_id=message_id,
        metadata={"status": payload.status, "reply": bool(payload.reply)},
    )
    return api_success(updated)


@router.get("/safety-reports")
async def safety_reports(
    status: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=250),
    user=Depends(get_ops_user),
):
    rows = await database.find_many("reports", {"status": status} if status else None, sort=[("updated_at", -1)], limit=limit)
    rows = [row for row in rows if _contains(row, search, ["report_type", "message", "user_name", "user_email", "user_phone", "status"])]
    return api_success({"count": len(rows), "items": rows})


@router.patch("/safety-reports/{report_id}")
async def update_safety_report(report_id: str, payload: OpsReportStatusBody, user=Depends(get_ops_manager)):
    existing = await database.find_one("reports", {"id": report_id})
    if not existing:
        api_error("Safety report not found.", 404)
    updates: Dict[str, Any] = {"status": payload.status, "updated_at": now_iso()}
    if payload.notes:
        updates["admin_notes"] = payload.notes
    updated = await database.update_one("reports", report_id, updates) or {**existing, **updates}
    if updated.get("user_id"):
        await create_app_notification(
            updated["user_id"],
            "safety_report_updated",
            "Safety report updated",
            "Your safety report status has been updated.",
            {"report_id": report_id},
        )
    await write_audit_log(
        actor_user_id=user.get("id"),
        actor_role=f"ops:{user.get('ops_role')}",
        action="ops_safety_report_updated",
        target_type="report",
        target_id=report_id,
        metadata={"status": payload.status, "notes": bool(payload.notes)},
    )
    return api_success(updated)


@router.get("/verifications")
async def verification_queue(
    status: Optional[str] = Query(default=None),
    limit: int = Query(default=80, ge=1, le=200),
    user=Depends(get_ops_manager),
):
    query = {"verification_status": status} if status else None
    rows = await database.find_many("drivers", query, sort=[("updated_at", -1)], limit=limit)
    result = []
    for row in rows:
        result.append({
            "id": row.get("id"),
            "user_id": row.get("user_id"),
            "name": row.get("name"),
            "email": row.get("email"),
            "phone": row.get("phone"),
            "city": row.get("city"),
            "status": row.get("status"),
            "verification_status": row.get("verification_status"),
            "verification_submitted_at": row.get("verification_submitted_at"),
            "updated_at": row.get("updated_at"),
        })
    return api_success({"count": len(result), "items": result, "mutation_requires_admin": True})


@router.get("/cases")
async def list_cases(
    status: Optional[str] = Query(default=None),
    escalation_level: Optional[str] = Query(default=None),
    assigned_to: Optional[str] = Query(default=None),
    priority: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=250),
    user=Depends(get_ops_user),
):
    rows = await database.find_many("ops_cases", sort=[("updated_at", -1)], limit=limit)
    filtered = []
    for row in rows:
        if status and row.get("status") != status:
            continue
        if escalation_level and _case_level(row) != escalation_level:
            continue
        if assigned_to and row.get("assigned_user_id") != assigned_to:
            continue
        if priority and row.get("priority") != priority:
            continue
        if not _contains(row, search, ["case_number", "subject", "description", "status", "priority", "assigned_name"]):
            continue
        filtered.append(_safe_case(row))
    return api_success({"count": len(filtered), "items": filtered})


@router.post("/cases")
async def create_case(payload: OpsCaseCreateBody, user=Depends(get_ops_user)):
    source = await _source_record(payload.source_type, payload.source_id)
    if payload.source_type != "manual" and payload.source_id:
        existing = await database.find_one(
            "ops_cases",
            {
                "source_type": payload.source_type,
                "source_id": payload.source_id,
                "status": {"$nin": ["resolved", "closed"]},
            },
        )
        if existing:
            return api_success(_safe_case(existing))
    timestamp = now_iso()
    case_id = new_id()
    customer_user_id = payload.customer_user_id or _source_customer_user_id(payload.source_type, source)
    case = {
        "id": case_id,
        "case_number": f"LGR-{timestamp[:10].replace('-', '')}-{case_id[:6].upper()}",
        "subject": payload.subject,
        "description": payload.description,
        "priority": payload.priority,
        "status": "open",
        "escalation_level": "cs",
        "source_type": payload.source_type,
        "source_id": payload.source_id,
        "customer_user_id": customer_user_id,
        "assigned_user_id": user.get("id") if user.get("ops_role") == "cs" else None,
        "assigned_name": (user.get("name") or user.get("email")) if user.get("ops_role") == "cs" else None,
        "created_by_user_id": user.get("id"),
        "created_at": timestamp,
        "updated_at": timestamp,
        "resolved_at": None,
    }
    created = await database.insert_one("ops_cases", case)
    await _case_event(case_id, user, "created", metadata={"source_type": payload.source_type, "source_id": payload.source_id, "priority": payload.priority})
    return api_success(_safe_case(created))


@router.get("/cases/{case_id}")
async def case_detail(case_id: str, user=Depends(get_ops_user)):
    case = await database.find_one("ops_cases", {"id": case_id})
    if not case:
        api_error("Operations case not found.", 404)
    source = await _source_record(case.get("source_type", "manual"), case.get("source_id"))
    customer = await database.find_one("users", {"id": case.get("customer_user_id")}) if case.get("customer_user_id") else None
    events = await database.find_many("ops_case_events", {"case_id": case_id}, sort=[("created_at", 1)], limit=300)
    return api_success({
        "case": _safe_case(case),
        "source": source,
        "customer": public_user(customer) if customer else None,
        "events": events,
    })


@router.post("/cases/{case_id}/notes")
async def add_case_note(case_id: str, payload: OpsCaseNoteBody, user=Depends(get_ops_user)):
    case = await database.find_one("ops_cases", {"id": case_id})
    if not case:
        api_error("Operations case not found.", 404)
    if not can_work_case(user, _case_level(case)):
        api_error("This case has been escalated above your role.", 403)
    event = await _case_event(case_id, user, "note", note=payload.note)
    await database.update_one("ops_cases", case_id, {"updated_at": now_iso()})
    return api_success(event)


@router.patch("/cases/{case_id}/assign")
async def assign_case(case_id: str, payload: OpsCaseAssignBody, user=Depends(get_ops_user)):
    case = await database.find_one("ops_cases", {"id": case_id})
    if not case:
        api_error("Operations case not found.", 404)
    level = _case_level(case)
    if not can_work_case(user, level):
        api_error("This case has been escalated above your role.", 403)
    if payload.assigned_user_id is None:
        if user.get("ops_role") == "cs" and case.get("assigned_user_id") not in {None, user.get("id")}:
            api_error("Customer Support can only release its own assignment.", 403)
        updates = {"assigned_user_id": None, "assigned_name": None, "updated_at": now_iso()}
        target_role = None
    else:
        target = await database.find_one("users", {"id": payload.assigned_user_id})
        if not target:
            api_error("Staff user not found.", 404)
        target_role = await _ops_role_for_user(target)
        if not target_role or OPS_ROLE_LEVELS[target_role] < OPS_ROLE_LEVELS[level]:
            api_error("That staff member cannot manage this escalation level.", 400)
        if user.get("ops_role") == "cs" and target.get("id") != user.get("id"):
            api_error("Customer Support can only assign a case to itself.", 403)
        updates = {
            "assigned_user_id": target.get("id"),
            "assigned_name": target.get("name") or target.get("email"),
            "updated_at": now_iso(),
        }
    updated = await database.update_one("ops_cases", case_id, updates) or {**case, **updates}
    await _case_event(case_id, user, "assigned", metadata={"assigned_user_id": payload.assigned_user_id, "assigned_role": target_role})
    return api_success(_safe_case(updated))


@router.post("/cases/{case_id}/escalate")
async def escalate_case(case_id: str, payload: OpsCaseEscalateBody, user=Depends(get_ops_user)):
    case = await database.find_one("ops_cases", {"id": case_id})
    if not case:
        api_error("Operations case not found.", 404)
    current = _case_level(case)
    if not can_work_case(user, current):
        api_error("This case has already been escalated above your role.", 403)
    index = CASE_LEVEL_ORDER.index(current)
    if index >= len(CASE_LEVEL_ORDER) - 1:
        api_error("This case is already at Admin level.", 409)
    next_level = CASE_LEVEL_ORDER[index + 1]
    updates = {
        "escalation_level": next_level,
        "status": "escalated",
        "assigned_user_id": None,
        "assigned_name": None,
        "updated_at": now_iso(),
    }
    updated = await database.update_one("ops_cases", case_id, updates) or {**case, **updates}
    await _case_event(case_id, user, "escalated", note=payload.reason, metadata={"from": current, "to": next_level})
    return api_success(_safe_case(updated))


@router.patch("/cases/{case_id}/status")
async def update_case_status(case_id: str, payload: OpsCaseStatusBody, user=Depends(get_ops_user)):
    case = await database.find_one("ops_cases", {"id": case_id})
    if not case:
        api_error("Operations case not found.", 404)
    level = _case_level(case)
    if not can_work_case(user, level):
        api_error("This case has been escalated above your role.", 403)
    if payload.status == "closed" and OPS_ROLE_LEVELS.get(user.get("ops_role"), 0) < OPS_ROLE_LEVELS["manager"]:
        api_error("Manager access is required to close a case.", 403)
    timestamp = now_iso()
    updates: Dict[str, Any] = {"status": payload.status, "updated_at": timestamp}
    if payload.status in {"resolved", "closed"}:
        updates["resolved_at"] = timestamp
    elif case.get("resolved_at"):
        updates["resolved_at"] = None
    updated = await database.update_one("ops_cases", case_id, updates) or {**case, **updates}
    await _case_event(case_id, user, "status_changed", note=payload.note, metadata={"from": case.get("status"), "to": payload.status})

    if case.get("source_type") == "support_message" and case.get("source_id") and payload.status in {"resolved", "closed"}:
        support = await database.update_one("support_messages", case["source_id"], {"status": payload.status, "updated_at": timestamp})
        if support and support.get("user_id"):
            await create_app_notification(
                support["user_id"],
                "support_reply",
                "Support case resolved",
                "Your LetsGoRide support case has been resolved.",
                {"support_message_id": case["source_id"]},
            )
    return api_success(_safe_case(updated))


@router.get("/staff")
async def list_staff(user=Depends(get_ops_manager)):
    staff_records = await database.find_many("ops_staff", sort=[("updated_at", -1)], limit=200)
    staff = [await _staff_row(row) for row in staff_records]
    admins = await database.find_many("users", {"role": "admin"}, sort=[("name", 1)], limit=50)
    for admin in admins:
        staff.append({
            "id": None,
            "user_id": admin.get("id"),
            "name": admin.get("name"),
            "email": admin.get("email"),
            "phone": admin.get("phone"),
            "role": "admin",
            "title": "Administrator",
            "enabled": admin.get("status") not in {"suspended", "deleted"},
            "created_at": admin.get("created_at"),
            "updated_at": admin.get("updated_at"),
        })
    role_order = {"admin": 0, "manager": 1, "cs": 2}
    staff.sort(key=lambda item: (role_order.get(item.get("role"), 9), str(item.get("name") or item.get("email") or "")))
    return api_success({"count": len(staff), "items": staff, "can_manage": user.get("ops_role") == "admin"})


@router.post("/staff")
async def provision_staff(payload: OpsStaffProvisionBody, user=Depends(get_ops_admin)):
    target = await database.find_one("users", {"id": payload.user_id})
    if not target:
        api_error("User not found.", 404)
    if target.get("role") == "admin":
        api_error("Existing Admin accounts already have full Operations access.", 409)
    if target.get("status") in {"suspended", "deleted"}:
        api_error("Suspended or deleted accounts cannot receive Operations access.", 409)
    existing = await database.find_one("ops_staff", {"user_id": payload.user_id})
    timestamp = now_iso()
    if existing:
        updated = await database.update_one("ops_staff", existing["id"], {
            "role": payload.role,
            "title": payload.title,
            "enabled": True,
            "updated_at": timestamp,
        }) or existing
        action = "ops_staff_updated"
    else:
        updated = await database.insert_one("ops_staff", {
            "id": new_id(),
            "user_id": payload.user_id,
            "role": payload.role,
            "title": payload.title,
            "enabled": True,
            "created_by_user_id": user.get("id"),
            "created_at": timestamp,
            "updated_at": timestamp,
        })
        action = "ops_staff_provisioned"
    await write_audit_log(
        actor_user_id=user.get("id"),
        actor_role="ops:admin",
        action=action,
        target_type="ops_staff",
        target_id=updated.get("id"),
        metadata={"user_id": payload.user_id, "role": payload.role, "reason": payload.reason},
    )
    return api_success(await _staff_row(updated))


@router.patch("/staff/{staff_id}")
async def update_staff(staff_id: str, payload: OpsStaffUpdateBody, user=Depends(get_ops_admin)):
    existing = await database.find_one("ops_staff", {"id": staff_id})
    if not existing:
        api_error("Staff record not found.", 404)
    updates: Dict[str, Any] = {"updated_at": now_iso()}
    if payload.role is not None:
        updates["role"] = payload.role
    if payload.title is not None:
        updates["title"] = payload.title
    if payload.enabled is not None:
        updates["enabled"] = payload.enabled
    updated = await database.update_one("ops_staff", staff_id, updates) or {**existing, **updates}
    await write_audit_log(
        actor_user_id=user.get("id"),
        actor_role="ops:admin",
        action="ops_staff_access_changed",
        target_type="ops_staff",
        target_id=staff_id,
        metadata={"updates": updates, "reason": payload.reason},
    )
    return api_success(await _staff_row(updated))


@router.get("/audit-logs")
async def audit_logs(
    limit: int = Query(default=100, ge=1, le=250),
    user=Depends(get_ops_manager),
):
    rows = await database.find_many("audit_logs", sort=[("created_at", -1)], limit=limit * 3)
    if user.get("ops_role") != "admin":
        rows = [row for row in rows if str(row.get("action") or "").startswith("ops_")]
    rows = rows[:limit]
    return api_success({"count": len(rows), "items": [_safe_audit_log(row) for row in rows]})
