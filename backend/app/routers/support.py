from fastapi import APIRouter, Depends

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
        "status": "received",
        "realtime_version": 1,
        "created_at": timestamp,
        "updated_at": timestamp,
        **payload.model_dump(),
    }
    created = await database.insert_one("support_messages", message)
    await notify_admins(
        "support_message",
        "New support message",
        f"{user.get('name') or 'A user'} sent a support message.",
        {"support_message_id": created["id"]},
    )
    await publish_support_realtime(created, "support_message.created")
    return api_success(created)


@router.get("/messages/my")
async def my_messages(user=Depends(get_current_user)):
    if user.get("role") == "admin":
        return api_success(await database.find_many("support_messages"))
    return api_success(await database.find_many("support_messages", {"user_id": user["id"]}))
