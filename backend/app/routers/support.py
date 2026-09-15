from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.auth import get_current_user
from app.database import database
from app.models.report import SupportMessageBody
from app.services.notification_service import notify_admins
from app.services.support_realtime_service import publish_support_realtime
from app.utils import api_success, new_id, now_iso


router = APIRouter(prefix="/support", tags=["support"])


@router.post("/messages")
async def create_message(payload: SupportMessageBody, user=Depends(get_current_user)):
    timestamp = now_iso()
    message = {
        "id": new_id(),
        "user_id": user["id"],
        "user_name": user.get("name"),
        "user_email": user.get("email"),
        "user_phone": user.get("phone") or payload.phone,
        "status": "waiting_for_agent",
        "assigned_support_user_id": None,
        "assigned_support_name": None,
        "support_joined_at": None,
        "closed_at": None,
        "realtime_version": 1,
        "created_at": timestamp,
        "updated_at": timestamp,
        **payload.model_dump(),
    }
    created = await database.insert_one("support_messages", message)
    await notify_admins(
        "support_message",
        "New support message",
        f"{user.get('name') or 'A user'} is waiting for Customer Support.",
        {"support_message_id": created["id"]},
    )
    await publish_support_realtime(created, "support_message.created")
    return api_success(created)


@router.get("/messages/my")
async def my_messages(
    limit: Optional[int] = Query(default=None, ge=1, le=500),
    user=Depends(get_current_user),
):
    filters = None if user.get("role") == "admin" else {"user_id": user["id"]}
    if limit is None:
        # Backward compatibility for already-shipped clients that expect the full list.
        return api_success(await database.find_many("support_messages", filters))
    return api_success(
        await database.find_many(
            "support_messages",
            filters,
            sort=[("updated_at", -1)],
            limit=limit,
        )
    )
