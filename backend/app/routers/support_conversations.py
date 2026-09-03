from typing import Any, Dict, Literal, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from app.auth import get_current_user
from app.database import database
from app.ops_auth import effective_ops_role, get_ops_user
from app.services.audit_service import write_audit_log
from app.services.notification_service import create_app_notification, notify_admins
from app.services.support_realtime_service import publish_support_realtime, update_versioned_support_message
from app.utils import api_error, api_success, new_id, now_iso


router = APIRouter(tags=["support-conversations"])
THREAD_COLLECTION = "support_thread_messages"
SUPPORT_STATUSES = {"received", "open", "in_review", "resolved", "closed"}


def _ensure_thread_collection() -> None:
    # Production MongoDB creates collections on first write. Development/tests use
    # the backend's bounded in-memory adapter, whose collection map is explicit.
    # Register only this additive support collection when that adapter is active.
    if database.db is None:
        database.memory.setdefault(THREAD_COLLECTION, [])


class CustomerSupportReplyBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str = Field(min_length=1, max_length=5000)


class OpsSupportReplyBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str = Field(min_length=1, max_length=5000)
    status: Optional[Literal["received", "open", "in_review", "resolved", "closed"]] = None


class OpsSupportNoteBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    note: str = Field(min_length=1, max_length=5000)


def _safe_thread_message(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": row.get("id"),
        "support_message_id": row.get("support_message_id"),
        "sender_type": row.get("sender_type"),
        "sender_user_id": row.get("sender_user_id"),
        "sender_name": row.get("sender_name"),
        "sender_ops_role": row.get("sender_ops_role"),
        "message": row.get("message"),
        "is_internal": bool(row.get("is_internal", False)),
        "created_at": row.get("created_at"),
        "synthetic": bool(row.get("synthetic", False)),
    }


async def _ticket(message_id: str) -> Dict[str, Any]:
    ticket = await database.find_one("support_messages", {"id": message_id})
    if not ticket:
        api_error("Support message not found.", 404)
    return ticket


def _initial_message(ticket: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": f"{ticket['id']}:initial",
        "support_message_id": ticket["id"],
        "sender_type": "customer",
        "sender_user_id": ticket.get("user_id"),
        "sender_name": ticket.get("user_name") or ticket.get("user_email") or "Customer",
        "sender_ops_role": None,
        "message": ticket.get("message") or "",
        "is_internal": False,
        "created_at": ticket.get("created_at") or ticket.get("updated_at"),
        "synthetic": True,
    }


async def _thread(ticket: Dict[str, Any], *, include_internal: bool) -> list[Dict[str, Any]]:
    _ensure_thread_collection()
    stored = await database.find_many(
        THREAD_COLLECTION,
        {"support_message_id": ticket["id"]},
        sort=[("created_at", 1)],
        limit=500,
    )
    rows: list[Dict[str, Any]] = [_initial_message(ticket)]
    rows.extend(stored)

    # Older Ops replies were stored only in admin_notes. Preserve that history
    # when a ticket predates the conversation layer, without duplicating newer
    # replies that already have persisted thread records.
    has_staff_reply = any(
        row.get("sender_type") == "staff" and not row.get("is_internal")
        for row in stored
    )
    if ticket.get("admin_notes") and not has_staff_reply:
        rows.append({
            "id": f"{ticket['id']}:legacy-staff-reply",
            "support_message_id": ticket["id"],
            "sender_type": "staff",
            "sender_user_id": None,
            "sender_name": "LetsGoRide Support",
            "sender_ops_role": None,
            "message": ticket.get("admin_notes"),
            "is_internal": False,
            "created_at": ticket.get("last_staff_reply_at") or ticket.get("updated_at"),
            "synthetic": True,
        })

    if not include_internal:
        rows = [row for row in rows if not row.get("is_internal")]
    rows.sort(key=lambda row: str(row.get("created_at") or ""))
    return [_safe_thread_message(row) for row in rows]


async def _insert_thread_message(
    ticket: Dict[str, Any],
    *,
    sender_type: Literal["customer", "staff"],
    sender_user_id: Optional[str],
    sender_name: Optional[str],
    sender_ops_role: Optional[str],
    message: str,
    is_internal: bool = False,
) -> Dict[str, Any]:
    _ensure_thread_collection()
    row = {
        "id": new_id(),
        "support_message_id": ticket["id"],
        "sender_type": sender_type,
        "sender_user_id": sender_user_id,
        "sender_name": sender_name,
        "sender_ops_role": sender_ops_role,
        "message": message,
        "is_internal": is_internal,
        "created_at": now_iso(),
    }
    return await database.insert_one(THREAD_COLLECTION, row)


@router.get("/support/messages/{message_id}/thread")
async def customer_support_thread(message_id: str, user=Depends(get_current_user)):
    ticket = await _ticket(message_id)
    if ticket.get("user_id") != user.get("id"):
        api_error("Support conversation not found.", 404)
    return api_success({
        "support_message_id": ticket["id"],
        "subject": ticket.get("subject"),
        "status": ticket.get("status"),
        "items": await _thread(ticket, include_internal=False),
    })


@router.post("/support/messages/{message_id}/replies")
async def customer_support_reply(
    message_id: str,
    payload: CustomerSupportReplyBody,
    user=Depends(get_current_user),
):
    ticket = await _ticket(message_id)
    if ticket.get("user_id") != user.get("id"):
        api_error("Support conversation not found.", 404)

    created = await _insert_thread_message(
        ticket,
        sender_type="customer",
        sender_user_id=user.get("id"),
        sender_name=user.get("name") or user.get("email") or "Customer",
        sender_ops_role=None,
        message=payload.message,
    )
    timestamp = now_iso()
    next_status = "received" if ticket.get("status") in {"resolved", "closed"} else (ticket.get("status") or "received")
    updated_ticket = await update_versioned_support_message(message_id, {
        "status": next_status,
        "updated_at": timestamp,
        "last_customer_reply_at": timestamp,
    })
    if updated_ticket:
        await publish_support_realtime(updated_ticket, "support_message.customer_replied")
    await notify_admins(
        "support_message",
        "Customer replied to support",
        f"{user.get('name') or 'A user'} replied to a support conversation.",
        {"support_message_id": message_id},
    )
    return api_success(_safe_thread_message(created))


@router.get("/ops/support/messages/{message_id}/thread")
async def ops_support_thread(message_id: str, user=Depends(get_ops_user)):
    ticket = await _ticket(message_id)
    return api_success({
        "support_message_id": ticket["id"],
        "subject": ticket.get("subject"),
        "status": ticket.get("status"),
        "customer": {
            "id": ticket.get("user_id"),
            "name": ticket.get("user_name"),
            "email": ticket.get("user_email"),
            "phone": ticket.get("user_phone"),
        },
        "items": await _thread(ticket, include_internal=True),
    })


@router.post("/ops/support/messages/{message_id}/reply")
async def ops_support_reply(
    message_id: str,
    payload: OpsSupportReplyBody,
    user=Depends(get_ops_user),
):
    ticket = await _ticket(message_id)
    status = payload.status or ticket.get("status") or "in_review"
    if status not in SUPPORT_STATUSES:
        api_error("Invalid support status.", 400)

    created = await _insert_thread_message(
        ticket,
        sender_type="staff",
        sender_user_id=user.get("id"),
        sender_name=user.get("name") or user.get("email") or "LetsGoRide Support",
        sender_ops_role=effective_ops_role(user),
        message=payload.message,
    )
    timestamp = now_iso()
    updated_ticket = await update_versioned_support_message(message_id, {
        "status": status,
        "admin_notes": payload.message,
        "last_staff_reply_at": timestamp,
        "updated_at": timestamp,
    })
    if updated_ticket:
        await publish_support_realtime(updated_ticket, "support_message.staff_replied")
    if ticket.get("user_id"):
        await create_app_notification(
            ticket["user_id"],
            "support_reply",
            "Support replied",
            "LetsGoRide Support replied to your case. Open Support for details.",
            {"support_message_id": message_id},
        )
    await write_audit_log(
        actor_user_id=user.get("id"),
        actor_role=f"ops:{effective_ops_role(user)}",
        action="ops_support_replied",
        target_type="support_message",
        target_id=message_id,
        metadata={"status": status, "thread_message_id": created.get("id")},
    )
    return api_success(_safe_thread_message(created))


@router.post("/ops/support/messages/{message_id}/notes")
async def ops_support_internal_note(
    message_id: str,
    payload: OpsSupportNoteBody,
    user=Depends(get_ops_user),
):
    ticket = await _ticket(message_id)
    created = await _insert_thread_message(
        ticket,
        sender_type="staff",
        sender_user_id=user.get("id"),
        sender_name=user.get("name") or user.get("email") or "LetsGoRide Staff",
        sender_ops_role=effective_ops_role(user),
        message=payload.note,
        is_internal=True,
    )
    await database.update_one("support_messages", message_id, {"updated_at": now_iso()})
    await write_audit_log(
        actor_user_id=user.get("id"),
        actor_role=f"ops:{effective_ops_role(user)}",
        action="ops_support_internal_note_added",
        target_type="support_message",
        target_id=message_id,
        metadata={"thread_message_id": created.get("id")},
    )
    return api_success(_safe_thread_message(created))
