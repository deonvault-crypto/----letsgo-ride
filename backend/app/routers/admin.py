import mimetypes
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, Header, Query
from fastapi.responses import FileResponse

from app.auth import get_admin_user
from app.database import database
from app.models.verification import VerificationStatusUpdateBody
from app.models.request import RideRequestUpdateBody
from app.models.ride import RideUpdateBody
from app.services.audit_service import write_audit_log
from app.services.auth_service import public_user
from app.services.ride_service import cleanup_demo_rides
from app.services.verification_service import apply_admin_verification_status
from app.utils import api_error, api_success, now_iso


router = APIRouter(prefix="/admin", tags=["admin"])


def _without_private_fields(rows):
    return [public_user(row) for row in rows]


async def _get_admin_from_header_or_query(
    authorization: str = Header(default=""),
    access_token: Optional[str] = Query(default=None),
):
    token = access_token or authorization.replace("Bearer", "").strip()
    if not token:
        api_error("Admin access is required.", 403)
    user = await database.find_one("users", {"token": token})
    if not user or user.get("role") != "admin":
        api_error("Admin access is required.", 403)
    return user


def _public_document(document):
    return {
        "id": document.get("id"),
        "document_type": document.get("document_type"),
        "file_name": document.get("file_name"),
        "uploaded_at": document.get("uploaded_at"),
        "status": document.get("status", "pending"),
        "rejection_reason": document.get("rejection_reason"),
        "content_type": mimetypes.guess_type(document.get("file_name") or "")[0],
    }


@router.get("/overview")
async def overview(admin=Depends(get_admin_user)):
    users = await database.find_many("users")
    rides = await database.find_many("rides")
    requests = await database.find_many("ride_requests")
    drivers = await database.find_many("drivers")
    support_messages = await database.find_many("support_messages")
    reports = await database.find_many("reports")
    return api_success(
        {
            "users": len(users),
            "rides": len([ride for ride in rides if ride.get("is_demo") is not True]),
            "requests": len(requests),
            "pending_verifications": len([driver for driver in drivers if driver.get("verification_status") == "pending"]),
            "support_messages": len(support_messages),
            "safety_reports": len(reports),
        }
    )


@router.get("/users")
async def list_users(role: Optional[str] = Query(default=None), admin=Depends(get_admin_user)):
    filters = {"role": role} if role else None
    users = await database.find_many("users", filters)
    return api_success(_without_private_fields(users))


@router.patch("/users/{user_id}/status")
async def update_user_status(
    user_id: str,
    status: str = Query(...),
    admin=Depends(get_admin_user),
):
    if status not in {"active", "suspended", "deleted"}:
        api_error("Unsupported user status.", 400)
    user = await database.update_one("users", user_id, {"status": status, "updated_at": now_iso()})
    if not user:
        api_error("User not found.", 404)
    await write_audit_log(
        actor_user_id=admin["id"],
        actor_role=admin.get("role"),
        action="admin_user_status_changed",
        target_type="user",
        target_id=user_id,
        metadata={"status": status},
    )
    return api_success(public_user(user))


@router.get("/rides")
async def admin_rides(admin=Depends(get_admin_user)):
    rides = await database.find_many("rides")
    return api_success([ride for ride in rides if ride.get("is_demo") is not True])


@router.patch("/rides/{ride_id}/status")
async def update_ride_status(ride_id: str, payload: RideUpdateBody, admin=Depends(get_admin_user)):
    updates = {key: value for key, value in payload.model_dump().items() if value is not None}
    if not updates:
        api_error("No ride updates provided.", 400)
    updates["updated_at"] = now_iso()
    ride = await database.update_one("rides", ride_id, updates)
    if not ride:
        api_error("Ride not found.", 404)
    await write_audit_log(
        actor_user_id=admin["id"],
        actor_role=admin.get("role"),
        action="admin_ride_updated",
        target_type="ride",
        target_id=ride_id,
        metadata=updates,
    )
    return api_success(ride)


@router.get("/requests")
async def admin_requests(admin=Depends(get_admin_user)):
    return api_success(await database.find_many("ride_requests"))


@router.patch("/requests/{request_id}/status")
async def update_request_status(request_id: str, payload: RideRequestUpdateBody, admin=Depends(get_admin_user)):
    request = await database.update_one("ride_requests", request_id, {"status": payload.status, "updated_at": now_iso()})
    if not request:
        api_error("Ride request not found.", 404)
    await write_audit_log(
        actor_user_id=admin["id"],
        actor_role=admin.get("role"),
        action="admin_request_status_changed",
        target_type="ride_request",
        target_id=request_id,
        metadata={"status": payload.status},
    )
    return api_success(request)


@router.get("/support/messages")
async def admin_support_messages(status: Optional[str] = Query(default=None), admin=Depends(get_admin_user)):
    filters = {"status": status} if status else None
    return api_success(await database.find_many("support_messages", filters))


@router.patch("/support/messages/{message_id}/status")
async def update_support_message_status(message_id: str, status: str = Query(...), admin=Depends(get_admin_user)):
    if status not in {"received", "in_review", "resolved"}:
        api_error("Unsupported support status.", 400)
    message = await database.update_one("support_messages", message_id, {"status": status, "updated_at": now_iso()})
    if not message:
        api_error("Support message not found.", 404)
    await write_audit_log(
        actor_user_id=admin["id"],
        actor_role=admin.get("role"),
        action="admin_support_status_changed",
        target_type="support_message",
        target_id=message_id,
        metadata={"status": status},
    )
    return api_success(message)


@router.get("/reports")
async def admin_reports(status: Optional[str] = Query(default=None), admin=Depends(get_admin_user)):
    filters = {"status": status} if status else None
    return api_success(await database.find_many("reports", filters))


@router.patch("/reports/{report_id}/status")
async def update_report_status(report_id: str, status: str = Query(...), admin=Depends(get_admin_user)):
    if status not in {"submitted", "in_review", "resolved"}:
        api_error("Unsupported report status.", 400)
    report = await database.update_one("reports", report_id, {"status": status, "updated_at": now_iso()})
    if not report:
        api_error("Report not found.", 404)
    await write_audit_log(
        actor_user_id=admin["id"],
        actor_role=admin.get("role"),
        action="admin_report_status_changed",
        target_type="report",
        target_id=report_id,
        metadata={"status": status},
    )
    return api_success(report)


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
    if payload.status == "rejected" and not payload.rejection_reason:
        api_error("Rejection reason is required.", 400)
    if payload.document_status == "rejected" and not payload.rejection_reason:
        api_error("Rejection reason is required.", 400)
    user = await database.find_one("users", {"id": driver.get("user_id")}) if driver.get("user_id") else None
    vehicles = await database.find_many("vehicles", {"driver_id": driver_id})
    documents = [_public_document(document) for document in driver.get("documents", [])]
    public_driver = dict(driver)
    public_driver["documents"] = documents
    return api_success(
        {
            "driver": public_driver,
            "user": public_user(user) if user else None,
            "vehicles": vehicles,
            "documents": documents,
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


@router.get("/verifications/{driver_id}/documents/{document_id}")
async def verification_document(driver_id: str, document_id: str, admin=Depends(_get_admin_from_header_or_query)):
    driver = await database.find_one("drivers", {"id": driver_id})
    if not driver:
        api_error("Verification submission not found.", 404)
    document = next((item for item in driver.get("documents", []) if item.get("id") == document_id), None)
    if not document:
        api_error("Document not found.", 404)
    storage_path = document.get("storage_path")
    if not storage_path:
        api_error("Document file is not available.", 404)
    path = Path(storage_path)
    if not path.exists() or not path.is_file():
        api_error("Document file is not available.", 404)
    media_type = mimetypes.guess_type(document.get("file_name") or str(path))[0] or "application/octet-stream"
    return FileResponse(
        path,
        media_type=media_type,
        filename=document.get("file_name") or "verification-document",
    )


@router.delete("/rides/demo")
async def delete_demo_rides(admin=Depends(get_admin_user)):
    result = await cleanup_demo_rides()
    await write_audit_log(
        actor_user_id=admin["id"],
        actor_role=admin.get("role"),
        action="demo_rides_cleanup",
        target_type="rides",
        target_id="demo",
        metadata=result,
    )
    return api_success(result)
