from fastapi import APIRouter, Depends

from app.auth import get_current_user
from app.database import database
from app.models.report import ReportCreateBody
from app.utils import api_success, new_id, now_iso


router = APIRouter(prefix="/reports", tags=["reports"])


@router.post("")
async def create_report(payload: ReportCreateBody, user=Depends(get_current_user)):
    timestamp = now_iso()
    report = {
        "id": new_id(),
        "user_id": user["id"],
        "user_name": user.get("name"),
        "user_email": user.get("email"),
        "user_phone": user.get("phone") or payload.user_phone,
        "status": "submitted",
        "is_demo": False,
        "created_at": timestamp,
        "updated_at": timestamp,
        **payload.model_dump(),
    }
    return api_success(await database.insert_one("reports", report))


@router.get("/my")
async def my_reports(user=Depends(get_current_user)):
    if user.get("role") == "admin":
        return api_success(await database.find_many("reports"))
    return api_success(await database.find_many("reports", {"user_id": user["id"]}))
