from fastapi import APIRouter, Depends

from app.auth import get_current_user
from app.database import database
from app.models.report import SupportMessageBody
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
        "is_demo": False,
        "created_at": timestamp,
        "updated_at": timestamp,
        **payload.model_dump(),
    }
    return api_success(await database.insert_one("support_messages", message))


@router.get("/messages/my")
async def my_messages(user=Depends(get_current_user)):
    if user.get("role") == "admin":
        return api_success(await database.find_many("support_messages"))
    return api_success(await database.find_many("support_messages", {"user_id": user["id"]}))
