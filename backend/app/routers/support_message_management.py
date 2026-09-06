from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from app.database import database
from app.ops_auth import effective_ops_role, get_ops_user
from app.services.audit_service import write_audit_log
from app.services.support_realtime_service import publish_support_realtime, update_versioned_support_message
from app.utils import api_error, api_success, now_iso


router = APIRouter(tags=["support-message-management"])
THREAD_COLLECTION = "support_thread_messages"


class OpsSupportThreadMessageEditBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str = Field(min_length=1, max_length=5000)


async def _ticket(message_id: str) -> Dict[str, Any]:
    ticket = await database.find_one("support_messages", {"id": message_id})
    if not ticket:
        api_error("Support message not found.", 404)
    return ticket


async def _thread_message(message_id: str, thread_message_id: str) -> Dict[str, Any]:
    row = await database.find_one(
        THREAD_COLLECTION,
        {"id": thread_message_id, "support_message_id": message_id},
    )
    if not row:
        api_error("Support reply not found.", 404)
    return row


def _require_staff_message_access(row: Dict[str, Any], user: Dict[str, Any]) -> None:
    if row.get("sender_type") != "staff" or row.get("is_internal") is True:
        api_error("Only public staff replies can be edited or deleted here.", 403)
    actor_id = str(user.get("id") or "")
    sender_id = str(row.get("sender_user_id") or "")
    if actor_id != sender_id and effective_ops_role(user) != "admin":
        api_error("You can only change your own support replies.", 403)


async def _latest_public_staff_reply(message_id: str) -> Dict[str, Any] | None:
    rows = await database.find_many(
        THREAD_COLLECTION,
        {
            "support_message_id": message_id,
            "sender_type": "staff",
            "is_internal": {"$ne": True},
        },
        sort=[("created_at", -1)],
        limit=1,
    )
    return rows[0] if rows else None


async def _reconcile_ticket_after_staff_message_change(message_id: str) -> Dict[str, Any] | None:
    latest = await _latest_public_staff_reply(message_id)
    timestamp = now_iso()
    return await update_versioned_support_message(
        message_id,
        {
            "admin_notes": latest.get("message") if latest else None,
            "last_staff_reply_at": latest.get("created_at") if latest else None,
            "updated_at": timestamp,
        },
    )


@router.patch("/ops/support/messages/{message_id}/thread/{thread_message_id}")
async def ops_edit_support_thread_message(
    message_id: str,
    thread_message_id: str,
    payload: OpsSupportThreadMessageEditBody,
    user=Depends(get_ops_user),
):
    await _ticket(message_id)
    row = await _thread_message(message_id, thread_message_id)
    _require_staff_message_access(row, user)

    message = payload.message.strip()
    if not message:
        api_error("Support reply cannot be empty.", 400)

    timestamp = now_iso()
    updated = await database.update_one(
        THREAD_COLLECTION,
        thread_message_id,
        {
            "message": message,
            "edited_at": timestamp,
            "edited_by_user_id": user.get("id"),
            "updated_at": timestamp,
        },
    )
    if not updated:
        api_error("Support reply could not be updated.", 409)

    ticket = await _reconcile_ticket_after_staff_message_change(message_id)
    if ticket:
        await publish_support_realtime(ticket, "support_message.staff_message_edited")

    await write_audit_log(
        actor_user_id=user.get("id"),
        actor_role=f"ops:{effective_ops_role(user)}",
        action="ops_support_reply_edited",
        target_type="support_thread_message",
        target_id=thread_message_id,
        metadata={"support_message_id": message_id},
    )
    return api_success({
        "id": updated.get("id"),
        "support_message_id": updated.get("support_message_id"),
        "message": updated.get("message"),
        "edited_at": updated.get("edited_at"),
    })


@router.delete("/ops/support/messages/{message_id}/thread/{thread_message_id}")
async def ops_delete_support_thread_message(
    message_id: str,
    thread_message_id: str,
    user=Depends(get_ops_user),
):
    await _ticket(message_id)
    row = await _thread_message(message_id, thread_message_id)
    _require_staff_message_access(row, user)

    await database.delete_many(
        THREAD_COLLECTION,
        {"id": thread_message_id, "support_message_id": message_id},
    )
    if await database.find_one(THREAD_COLLECTION, {"id": thread_message_id}):
        api_error("Support reply could not be deleted.", 409)

    ticket = await _reconcile_ticket_after_staff_message_change(message_id)
    if ticket:
        await publish_support_realtime(ticket, "support_message.staff_message_deleted")

    await write_audit_log(
        actor_user_id=user.get("id"),
        actor_role=f"ops:{effective_ops_role(user)}",
        action="ops_support_reply_deleted",
        target_type="support_thread_message",
        target_id=thread_message_id,
        metadata={"support_message_id": message_id},
    )
    return api_success({"deleted": True, "id": thread_message_id})
