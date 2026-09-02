import asyncio
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query

from app.database import database
from app.models.ops import OpsCaseUpdateBody, OpsEscalationBody, OpsStaffRoleBody
from app.ops_auth import can_manage_case_level, effective_ops_role, get_ops_user, require_ops_level
from app.services.auth_service import public_user
from app.utils import api_error, api_success, new_id, now_iso


router = APIRouter(prefix="/ops", tags=["operations-control-center"])


CASE_LEVEL_ORDER = ["cs", "manager", "admin"]


def _case_level(row: Dict[str, Any]) -> str:
    level = str(row.get("ops_escalation_level") or "cs").strip().lower()
    return level if level in CASE_LEVEL_ORDER else "cs"


def _safe_case(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": row.get("id"),
        "user_id": row.get("user_id"),
        "user_name": row.get("user_name"),
        "user_email": row.get("user_email"),
        "user_phone": row.get("user_phone"),
        "subject": row.get("subject"),
        "message": row.get("message"),
        "status": row.get("status", "received"),
        "priority": row.get("priority", "normal"),
        "assigned_to": row.get("ops_assigned_to"),
        "assigned_name": row.get("ops_assigned_name"),
        "escalation_level": _case_level(row),
        "escalation_reason": row.get("ops_escalation_reason"),
        "resolution": row.get("ops_resolution"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


def _safe_ride(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        key: row.get(key)
        for key in (
            "id", "user_id", "driver_name", "origin", "destination", "date", "time",
            "status", "available_seats", "price_per_seat", "created_at", "updated_at",
        )
    }


def _safe_ride_request(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        key: row.get(key)
        for key in (
            "id", "ride_id", "user_id", "passenger_name", "seats", "status",
            "created_at", "updated_at",
        )
    }


def _safe_report(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        key: row.get(key)
        for key in (
            "id", "user_id", "user_name", "user_email", "report_type", "description",
            "details", "status", "created_at", "updated_at",
        )
    }


async def _write_case_event(case_id: str, actor: Dict[str, Any], event_type: str, details: Dict[str, Any]) -> None:
    await database.insert_one(
        "audit_logs",
        {
            "id": new_id(),
            "action": "ops_case_event",
            "case_id": case_id,
            "event_type": event_type,
            "actor_id": actor.get("id"),
            "actor_name": actor.get("name"),
            "actor_email": actor.get("email"),
            "actor_ops_role": effective_ops_role(actor),
            "details": details,
            "created_at": now_iso(),
        },
    )


@router.get("/me")
async def ops_me(user=Depends(get_ops_user)):
    safe = public_user(user)
    safe["ops_role"] = effective_ops_role(user)
    return api_success(safe)


@router.get("/overview")
async def overview(user=Depends(get_ops_user)):
    (
        users,
        rides,
        ride_requests,
        support_total,
        support_open,
        reports_open,
        drivers_pending,
        recent_cases,
    ) = await asyncio.gather(
        database.count("users"),
        database.count("rides"),
        database.count("ride_requests"),
        database.count("support_messages"),
        database.count("support_messages", {"status": {"$nin": ["resolved", "closed"]}}),
        database.count("reports", {"status": {"$nin": ["resolved", "dismissed"]}}),
        database.count("drivers", {"verification_status": {"$in": ["pending", "pending_uploads", "pending_auto_check", "needs_review", "needs_resubmission"]}}),
        database.find_many("support_messages", sort=[("updated_at", -1)], limit=8),
    )
    manager_cases = 0
    admin_cases = 0
    for row in recent_cases:
        if _case_level(row) == "manager" and row.get("status") not in {"resolved", "closed"}:
            manager_cases += 1
        if _case_level(row) == "admin" and row.get("status") not in {"resolved", "closed"}:
            admin_cases += 1
    return api_success(
        {
            "staff_role": effective_ops_role(user),
            "users": users,
            "rides": rides,
            "ride_requests": ride_requests,
            "support_total": support_total,
            "open_support_cases": support_open,
            "open_safety_reports": reports_open,
            "pending_driver_verifications": drivers_pending,
            "manager_escalations_recent": manager_cases,
            "admin_escalations_recent": admin_cases,
            "recent_cases": [_safe_case(row) for row in recent_cases],
        }
    )


@router.get("/cases")
async def list_cases(
    status: Optional[str] = Query(default=None),
    escalation_level: Optional[str] = Query(default=None),
    assigned_to: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=200),
    user=Depends(get_ops_user),
):
    rows = await database.find_many("support_messages", sort=[("updated_at", -1)], limit=limit)
    filtered: List[Dict[str, Any]] = []
    term = (search or "").strip().lower()
    for row in rows:
        if status and row.get("status", "received") != status:
            continue
        if escalation_level and _case_level(row) != escalation_level:
            continue
        if assigned_to and row.get("ops_assigned_to") != assigned_to:
            continue
        if term:
            haystack = " ".join(str(row.get(key) or "") for key in ["subject", "message", "user_name", "user_email", "user_phone"]).lower()
            if term not in haystack:
                continue
        filtered.append(_safe_case(row))
    return api_success(filtered)


@router.get("/cases/{case_id}")
async def case_detail(case_id: str, user=Depends(get_ops_user)):
    row = await database.find_one("support_messages", {"id": case_id})
    if not row:
        api_error("Support case not found.", 404)
    events = await database.find_many(
        "audit_logs",
        {"action": "ops_case_event", "case_id": case_id},
        sort=[("created_at", 1)],
        limit=200,
    )
    return api_success({"case": _safe_case(row), "events": events})


@router.patch("/cases/{case_id}")
async def update_case(case_id: str, payload: OpsCaseUpdateBody, user=Depends(get_ops_user)):
    row = await database.find_one("support_messages", {"id": case_id})
    if not row:
        api_error("Support case not found.", 404)
    level = _case_level(row)
    if not can_manage_case_level(user, level):
        api_error("This case has been escalated above your Operations role.", 403)

    updates: Dict[str, Any] = {"updated_at": now_iso()}
    changes: Dict[str, Any] = {}
    if payload.status is not None:
        updates["status"] = payload.status
        changes["status"] = payload.status
    if payload.assigned_to is not None:
        target = await database.find_one("users", {"id": payload.assigned_to})
        if not target or not effective_ops_role(target):
            api_error("Assigned staff member does not have Operations access.", 400)
        if not can_manage_case_level(target, level):
            api_error("Assigned staff member cannot manage this escalation level.", 400)
        updates["ops_assigned_to"] = target["id"]
        updates["ops_assigned_name"] = target.get("name") or target.get("email")
        changes["assigned_to"] = target["id"]
    if payload.resolution is not None:
        updates["ops_resolution"] = payload.resolution
        changes["resolution"] = payload.resolution
    updated = await database.update_one("support_messages", case_id, updates) or {**row, **updates}
    if changes:
        await _write_case_event(case_id, user, "case_updated", changes)
    if payload.internal_note:
        await _write_case_event(case_id, user, "internal_note", {"note": payload.internal_note})
    return api_success(_safe_case(updated))


@router.post("/cases/{case_id}/escalate")
async def escalate_case(case_id: str, payload: OpsEscalationBody, user=Depends(get_ops_user)):
    row = await database.find_one("support_messages", {"id": case_id})
    if not row:
        api_error("Support case not found.", 404)
    current = _case_level(row)
    actor_role = effective_ops_role(user)
    if not can_manage_case_level(user, current):
        api_error("This case has already been escalated above your Operations role.", 403)
    current_index = CASE_LEVEL_ORDER.index(current)
    if current_index >= len(CASE_LEVEL_ORDER) - 1:
        api_error("This case is already at Admin level.", 409)
    next_level = CASE_LEVEL_ORDER[current_index + 1]
    if actor_role == "cs" and next_level != "manager":
        api_error("Customer Support can escalate only to Manager.", 403)
    if actor_role == "manager" and current == "manager" and next_level != "admin":
        api_error("Manager can escalate only to Admin.", 403)
    updates = {
        "ops_escalation_level": next_level,
        "ops_escalation_reason": payload.reason,
        "ops_escalated_by": user.get("id"),
        "ops_escalated_at": now_iso(),
        "ops_assigned_to": None,
        "ops_assigned_name": None,
        "status": "open" if row.get("status") in {"received", "closed", "resolved"} else row.get("status", "open"),
        "updated_at": now_iso(),
    }
    updated = await database.update_one("support_messages", case_id, updates) or {**row, **updates}
    await _write_case_event(case_id, user, "escalated", {"from": current, "to": next_level, "reason": payload.reason})
    return api_success(_safe_case(updated))


@router.get("/users")
async def search_users(
    search: Optional[str] = Query(default=None),
    role: Optional[str] = Query(default=None),
    limit: int = Query(default=80, ge=1, le=200),
    user=Depends(get_ops_user),
):
    rows = await database.find_many("users", sort=[("updated_at", -1)], limit=limit)
    term = (search or "").strip().lower()
    result = []
    for row in rows:
        if role and row.get("role") != role:
            continue
        if term:
            haystack = " ".join(str(row.get(key) or "") for key in ["name", "email", "phone", "city", "role", "status"]).lower()
            if term not in haystack:
                continue
        safe = public_user(row)
        safe["ops_role"] = effective_ops_role(row) or None
        result.append(safe)
    return api_success(result)


@router.get("/rides")
async def list_rides(
    status: Optional[str] = Query(default=None),
    limit: int = Query(default=80, ge=1, le=200),
    user=Depends(get_ops_user),
):
    query = {"status": status} if status else None
    rows = await database.find_many("rides", query, sort=[("updated_at", -1)], limit=limit)
    return api_success([_safe_ride(row) for row in rows])


@router.get("/ride-requests")
async def list_ride_requests(
    status: Optional[str] = Query(default=None),
    limit: int = Query(default=80, ge=1, le=200),
    user=Depends(get_ops_user),
):
    query = {"status": status} if status else None
    rows = await database.find_many("ride_requests", query, sort=[("updated_at", -1)], limit=limit)
    return api_success([_safe_ride_request(row) for row in rows])


@router.get("/safety-reports")
async def list_safety_reports(
    status: Optional[str] = Query(default=None),
    limit: int = Query(default=80, ge=1, le=200),
    user=Depends(get_ops_user),
):
    query = {"status": status} if status else None
    rows = await database.find_many("reports", query, sort=[("updated_at", -1)], limit=limit)
    return api_success([_safe_report(row) for row in rows])


@router.get("/staff")
async def list_staff(user=Depends(get_ops_user)):
    require_ops_level(user, "manager")
    rows = await database.find_many("users", sort=[("name", 1)])
    staff = []
    for row in rows:
        role = effective_ops_role(row)
        if not role:
            continue
        safe = public_user(row)
        safe["ops_role"] = role
        staff.append(safe)
    return api_success(staff)


@router.patch("/staff/{user_id}/role")
async def set_staff_role(user_id: str, payload: OpsStaffRoleBody, user=Depends(get_ops_user)):
    require_ops_level(user, "admin")
    target = await database.find_one("users", {"id": user_id})
    if not target:
        api_error("User not found.", 404)
    if target.get("role") == "admin" and payload.ops_role not in {None, "admin"}:
        api_error("Existing product Admin accounts always retain Ops Admin access.", 409)
    updates = {"ops_role": payload.ops_role, "updated_at": now_iso()}
    updated = await database.update_one("users", user_id, updates) or {**target, **updates}
    await database.insert_one(
        "audit_logs",
        {
            "id": new_id(),
            "action": "ops_staff_role_changed",
            "actor_id": user.get("id"),
            "target_user_id": user_id,
            "previous_ops_role": effective_ops_role(target) or None,
            "new_ops_role": effective_ops_role(updated) or None,
            "reason": payload.reason,
            "created_at": now_iso(),
        },
    )
    safe = public_user(updated)
    safe["ops_role"] = effective_ops_role(updated) or None
    return api_success(safe)
