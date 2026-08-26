from typing import Optional

import asyncio

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import FileResponse, Response

from app.auth import get_current_user
from app.models.operations import (
    AvailabilityCreateBody,
    CourierOnlineBody,
    CourierProfileCreateBody,
    CourierShiftCreateBody,
    CourierShiftUpdateBody,
    WorkerApplicationBody,
    WorkerApplicationReviewBody,
)
from app.services.courier_earnings_service import courier_earnings_summary
from app.services.operations_service import (
    active_courier_delivery,
    admin_courier_deliveries,
    approve_courier_profile,
    assigned_courier_deliveries,
    claim_courier_offer,
    courier_delivery_history,
    courier_workspace_snapshot,
    create_availability,
    create_courier_profile,
    delete_availability,
    get_courier_profile,
    list_availability,
    list_courier_offers,
    set_courier_online,
)
from app.services.workforce_service import (
    available_courier_shifts,
    book_courier_shift,
    cancel_courier_shift_booking,
    create_courier_shift,
    list_courier_shifts,
    list_my_applications,
    list_worker_applications_for_admin,
    my_courier_shift_bookings,
    review_worker_application,
    save_worker_application,
    submit_worker_application,
    update_courier_shift,
    upload_worker_document,
)
from app.utils import api_error, api_success
from app.database import database
from app.services.private_document_service import contained_legacy_document_path, private_document_service, private_provider_document_bytes


router = APIRouter(prefix="/operations", tags=["operations"])


def _require_work_account(user) -> None:
    if user.get("role") not in {"driver", "courier", "admin"}:
        api_error("A Driver or Courier account is required for this workspace.", 403)


def _require_courier_account(user) -> None:
    if user.get("role") not in {"courier", "admin"}:
        api_error("A Courier account is required for delivery work.", 403)


def _require_admin(user) -> None:
    if user.get("role") != "admin":
        api_error("Administrator access is required.", 403)


@router.get("/applications/my")
async def my_worker_applications(user=Depends(get_current_user)):
    return api_success(await list_my_applications(user))


@router.post("/applications")
async def save_application(payload: WorkerApplicationBody, user=Depends(get_current_user)):
    try:
        return api_success(await save_worker_application(payload.model_dump(), user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 400)


@router.post("/applications/{application_id}/documents")
async def upload_application_document(
    application_id: str,
    document_type: str = Form(...),
    file: UploadFile = File(...),
    user=Depends(get_current_user),
):
    try:
        return api_success(await upload_worker_document(application_id, document_type, file, user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 400)
    except RuntimeError as exc:
        api_error(str(exc), 503)


@router.post("/applications/{application_id}/submit")
async def submit_application(application_id: str, user=Depends(get_current_user)):
    try:
        return api_success(await submit_worker_application(application_id, user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 400)


@router.get("/admin/applications")
async def admin_worker_applications(
    status: Optional[str] = Query(default=None),
    product: Optional[str] = Query(default=None),
    user=Depends(get_current_user),
):
    _require_admin(user)
    try:
        return api_success(await list_worker_applications_for_admin(status, product))
    except ValueError as exc:
        api_error(str(exc), 400)


@router.post("/admin/applications/{application_id}/review")
async def admin_review_worker_application(
    application_id: str,
    payload: WorkerApplicationReviewBody,
    user=Depends(get_current_user),
):
    _require_admin(user)
    try:
        return api_success(await review_worker_application(application_id, payload.status, payload.note, user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 400)


@router.post("/admin/applications/{application_id}/documents/{document_id}/access")
async def admin_worker_document_access(application_id: str, document_id: str, user=Depends(get_current_user)):
    _require_admin(user)
    application = await database.find_one("worker_applications", {"id": application_id})
    document = next((item for item in (application or {}).get("documents", []) if item.get("id") == document_id), None)
    if not document:
        api_error("Document not found.", 404)
    token = await private_document_service.issue(actor_id=str(user["id"]), collection="worker_applications", owner_id=application_id, document_id=document_id)
    return api_success({"url": f"/operations/admin/applications/{application_id}/documents/{document_id}/view?document_token={token}"})


@router.get("/admin/applications/{application_id}/documents/{document_id}/view")
async def admin_worker_document_view(application_id: str, document_id: str, document_token: str = Query(default="")):
    ticket = await private_document_service.consume(document_token)
    if not ticket or ticket.get("collection") != "worker_applications" or ticket.get("owner_id") != application_id or ticket.get("document_id") != document_id:
        api_error("This document link is invalid or expired.", 401)
    admin = await database.find_one("users", {"id": ticket["actor_id"]})
    if not admin or admin.get("role") != "admin":
        api_error("Administrator access is required.", 403)
    application = await database.find_one("worker_applications", {"id": application_id})
    document = next((item for item in (application or {}).get("documents", []) if item.get("id") == document_id), None)
    if not document:
        api_error("Document not found.", 404)
    if document.get("cloudinary_public_id"):
        try:
            content, media_type = await asyncio.to_thread(private_provider_document_bytes, document)
        except Exception:
            api_error("Document file is unavailable. The applicant may need to re-upload.", 404)
        return Response(content=content, media_type=media_type, headers={"Cache-Control": "no-store"})
    try:
        path = contained_legacy_document_path(document)
    except (FileNotFoundError, OSError):
        api_error("Document file is unavailable. The applicant may need to re-upload.", 404)
    return FileResponse(path, media_type=document.get("content_type") or "application/octet-stream", filename=document.get("file_name") or "application-document")


@router.get("/admin/courier/shifts")
async def admin_courier_shifts(user=Depends(get_current_user)):
    _require_admin(user)
    return api_success(await list_courier_shifts(include_inactive=True))


@router.get("/admin/courier/deliveries")
async def admin_courier_delivery_list(user=Depends(get_current_user)):
    _require_admin(user)
    return api_success(await admin_courier_deliveries())


@router.post("/admin/courier/shifts")
async def admin_create_courier_shift(payload: CourierShiftCreateBody, user=Depends(get_current_user)):
    _require_admin(user)
    try:
        return api_success(await create_courier_shift(payload.model_dump(), user))
    except (PermissionError, ValueError) as exc:
        api_error(str(exc), 400 if isinstance(exc, ValueError) else 403)


@router.patch("/admin/courier/shifts/{shift_id}")
async def admin_update_courier_shift(
    shift_id: str,
    payload: CourierShiftUpdateBody,
    user=Depends(get_current_user),
):
    _require_admin(user)
    try:
        return api_success(await update_courier_shift(shift_id, payload.model_dump(exclude_unset=True), user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 400)


@router.get("/courier/shifts/available")
async def courier_available_shifts(user=Depends(get_current_user)):
    _require_courier_account(user)
    try:
        return api_success(await available_courier_shifts(user))
    except PermissionError as exc:
        api_error(str(exc), 403)


@router.get("/courier/shifts/my")
async def courier_my_shifts(user=Depends(get_current_user)):
    _require_courier_account(user)
    try:
        return api_success(await my_courier_shift_bookings(user))
    except PermissionError as exc:
        api_error(str(exc), 403)


@router.post("/courier/shifts/{shift_id}/book")
async def courier_book_shift(shift_id: str, user=Depends(get_current_user)):
    _require_courier_account(user)
    try:
        return api_success(await book_courier_shift(shift_id, user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 409)


@router.post("/courier/shift-bookings/{booking_id}/cancel")
async def courier_cancel_shift(booking_id: str, user=Depends(get_current_user)):
    _require_courier_account(user)
    try:
        return api_success(await cancel_courier_shift_booking(booking_id, user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 409)


@router.get("/availability")
async def my_availability(user=Depends(get_current_user)):
    _require_work_account(user)
    return api_success(await list_availability(user))


@router.post("/availability")
async def add_availability(payload: AvailabilityCreateBody, user=Depends(get_current_user)):
    _require_work_account(user)
    try:
        return api_success(await create_availability(payload.model_dump(), user))
    except ValueError as exc:
        api_error(str(exc), 400)


@router.delete("/availability/{item_id}")
async def remove_availability(item_id: str, user=Depends(get_current_user)):
    _require_work_account(user)
    try:
        return api_success({"deleted": await delete_availability(item_id, user)})
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 404)


@router.get("/courier/profile")
async def courier_profile(user=Depends(get_current_user)):
    _require_courier_account(user)
    return api_success(await get_courier_profile(user))


@router.get("/courier/workspace")
async def courier_workspace(user=Depends(get_current_user)):
    _require_courier_account(user)
    try:
        return api_success(await courier_workspace_snapshot(user))
    except PermissionError as exc:
        api_error(str(exc), 403)


@router.post("/courier/profile")
async def courier_profile_create(payload: CourierProfileCreateBody, user=Depends(get_current_user)):
    _require_courier_account(user)
    return api_success(await create_courier_profile(payload.model_dump(), user))


@router.post("/courier/online")
async def courier_online(payload: CourierOnlineBody, user=Depends(get_current_user)):
    _require_courier_account(user)
    try:
        return api_success(await set_courier_online(user, payload.online))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 400)


@router.post("/courier/profiles/{profile_id}/approve")
async def courier_profile_approve(profile_id: str, user=Depends(get_current_user)):
    # Approval is intentionally admin-only inside approve_courier_profile.
    try:
        return api_success(await approve_courier_profile(profile_id, user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 404)


@router.get("/courier/deliveries")
async def courier_assigned_deliveries(user=Depends(get_current_user)):
    _require_courier_account(user)
    return api_success(await assigned_courier_deliveries(user))


@router.get("/courier/deliveries/active")
async def courier_active_delivery(user=Depends(get_current_user)):
    _require_courier_account(user)
    return api_success(await active_courier_delivery(user))


@router.get("/courier/deliveries/history")
async def courier_delivery_history_list(user=Depends(get_current_user)):
    _require_courier_account(user)
    return api_success(await courier_delivery_history(user))


@router.get("/courier/earnings")
async def courier_earnings(user=Depends(get_current_user)):
    _require_courier_account(user)
    return api_success(await courier_earnings_summary(user))


@router.get("/courier/offers")
async def courier_delivery_offers(user=Depends(get_current_user)):
    _require_courier_account(user)
    try:
        return api_success(await list_courier_offers(user))
    except PermissionError as exc:
        api_error(str(exc), 403)


@router.post("/courier/offers/{delivery_id}/claim")
async def courier_claim_delivery_offer(delivery_id: str, user=Depends(get_current_user)):
    _require_courier_account(user)
    try:
        return api_success(await claim_courier_offer(delivery_id, user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 409)
