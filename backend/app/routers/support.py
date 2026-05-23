from fastapi import APIRouter

from app.database import database
from app.models.report import SupportMessageBody
from app.utils import api_success, new_id, now_iso


router = APIRouter(prefix="/support", tags=["support"])


@router.post("/messages")
async def create_message(payload: SupportMessageBody):
    timestamp = now_iso()
    message = {
        "id": new_id(),
        "status": "received",
        "is_demo": False,
        "created_at": timestamp,
        "updated_at": timestamp,
        **payload.model_dump(),
    }
    return api_success(await database.insert_one("support_messages", message))


@router.get("/messages/my")
async def my_messages():
    return api_success(await database.find_many("support_messages"))
