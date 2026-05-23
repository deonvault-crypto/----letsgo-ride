from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.auth import get_admin_user
from app.database import database
from app.models.verification import VerificationStatusUpdateBody
from app.services.verification_service import apply_admin_verification_status
from app.utils import api_error, api_success


router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/verifications")
async def list_verifications(
    status: Optional[str] = Query(default=None),
    admin=Depends(get_admin_user),
):
    filters = {}
    if status:
        filters["verification_status"] = status
    drivers = await database.find_many("drivers", filters)
    rows = []
    for driver in drivers:
        rows.append(
            {
                "driver_id": driver.get("id"),
                "name": driver.get("name"),
                "phone": driver.get("phone"),
                "email": driver.get("email"),
                "city": driver.get("city"),
                "driver_status": driver.get("status"),
                "verification_status": driver.get("verification_status", "not_started"),
                "verification_provider": driver.get("verification_provider", "manual"),
                "verification_submitted_at": driver.get("verification_submitted_at"),
                "document_count": len(driver.get("documents", [])),
            }
        )
    return api_success({"count": len(rows), "items": rows})


@router.get("/verifications/{driver_id}")
async def verification_detail(driver_id: str, admin=Depends(get_admin_user)):
    driver = await database.find_one("drivers", {"id": driver_id})
    if not driver:
        api_error("Verification submission not found.", 404)
    user = await database.find_one("users", {"id": driver.get("user_id")}) if driver.get("user_id") else None
    vehicles = await database.find_many("vehicles", {"driver_id": driver_id})
    return api_success(
        {
            "driver": driver,
            "user": user,
            "vehicles": vehicles,
            "documents": driver.get("documents", []),
        }
    )


@router.patch("/verifications/{driver_id}/status")
async def update_verification_status(
    driver_id: str,
    payload: VerificationStatusUpdateBody,
    admin=Depends(get_admin_user),
):
    driver = await database.find_one("drivers", {"id": driver_id})
    if not driver:
        api_error("Verification submission not found.", 404)
    updated = await apply_admin_verification_status(
        admin=admin,
        driver=driver,
        status=payload.status,
        admin_notes=payload.admin_verification_notes,
        rejection_reason=payload.rejection_reason,
        document_id=payload.document_id,
        document_status=payload.document_status,
    )
    return api_success(updated)
