from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.auth import get_current_user
from app.database import database
from app.models.report import ReportCreateBody
from app.services.notification_service import notify_admins
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
        "created_at": timestamp,
        "updated_at": timestamp,
        **payload.model_dump(),
    }
    created = await database.insert_one("reports", report)
    await notify_admins(
        "safety_report",
        "New safety report",
        "A safety report needs review.",
        {"report_id": created["id"]},
    )
    return api_success(created)


@router.get("/my")
async def my_reports(
    limit: Optional[int] = Query(default=None, ge=1, le=500),
    user=Depends(get_current_user),
):
    filters = None if user.get("role") == "admin" else {"user_id": user["id"]}
    if limit is None:
        # Backward compatibility for already-shipped clients that expect the full list.
        return api_success(await database.find_many("reports", filters))
    return api_success(
        await database.find_many(
            "reports",
            filters,
            sort=[("created_at", -1)],
            limit=limit,
        )
    )
