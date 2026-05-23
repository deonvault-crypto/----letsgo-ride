from fastapi import APIRouter

from app.database import database
from app.models.report import ReportCreateBody
from app.utils import api_success, new_id, now_iso


router = APIRouter(prefix="/reports", tags=["reports"])


@router.post("")
async def create_report(payload: ReportCreateBody):
    timestamp = now_iso()
    report = {
        "id": new_id(),
        "status": "submitted",
        "is_demo": False,
        "created_at": timestamp,
        "updated_at": timestamp,
        **payload.model_dump(),
    }
    return api_success(await database.insert_one("reports", report))


@router.get("/my")
async def my_reports():
    return api_success(await database.find_many("reports"))
