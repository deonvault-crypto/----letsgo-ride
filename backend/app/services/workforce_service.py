from __future__ import annotations

import asyncio
import io
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

import cloudinary
import cloudinary.uploader
import cloudinary.utils
from fastapi import UploadFile
from pymongo.errors import DuplicateKeyError

from app.config import get_settings
from app.database import database
from app.services.audit_service import write_audit_log
from app.services.notification_service import create_app_notification
from app.utils import new_id, now_iso


APPLICATION_STATUSES = {"DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED"}
DOCUMENT_TYPES = {
    "identity_document",
    "selfie",
    "driver_licence",
    "vehicle_registration",
    "business_registration",
}
REQUIRED_DOCUMENTS = {
    "courier": {"identity_document", "selfie"},
    "driver": {"identity_document", "selfie", "driver_licence", "vehicle_registration"},
    "merchant": {"identity_document", "business_registration"},
}
MAX_DOCUMENT_BYTES = 8 * 1024 * 1024
ALLOWED_DOCUMENT_TYPES = {"image/jpeg", "image/png", "image/webp", "application/pdf"}


def _user_id(user: Dict[str, Any]) -> str:
    return str(user.get("id") or "")


def _parse_datetime(value: Any) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("A valid date and time is required.")
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("Use a valid ISO date and time.") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _safe_file_name(value: str) -> str:
    return "".join(character for character in value if character.isalnum() or character in ("-", "_", ".")).strip(".") or "document"


def _public_document(document: Dict[str, Any]) -> Dict[str, Any]:
    file_url = document.get("file_url")
    if document.get("cloudinary_public_id") and document.get("delivery_type") == "authenticated":
        settings = get_settings()
        if settings.cloudinary_cloud_name and settings.cloudinary_api_key and settings.cloudinary_api_secret:
            cloudinary.config(
                cloud_name=settings.cloudinary_cloud_name,
                api_key=settings.cloudinary_api_key,
                api_secret=settings.cloudinary_api_secret,
                secure=True,
            )
            file_url = cloudinary.utils.cloudinary_url(
                document["cloudinary_public_id"],
                secure=True,
                sign_url=True,
                type="authenticated",
                resource_type=document.get("resource_type") or "image",
                format=document.get("format") or None,
                version=document.get("version") or None,
            )[0]
    return {
        "id": document.get("id"),
        "document_type": document.get("document_type"),
        "file_name": document.get("file_name"),
        "file_url": file_url,
        "uploaded_at": document.get("uploaded_at"),
        "status": document.get("status", "PENDING"),
        "rejection_reason": document.get("rejection_reason"),
    }


def public_application(application: Dict[str, Any]) -> Dict[str, Any]:
    result = dict(application)
    result["documents"] = [_public_document(item) for item in application.get("documents", [])]
    product = str(application.get("product") or "")
    present = {str(item.get("document_type") or "") for item in application.get("documents", [])}
    result["required_document_types"] = sorted(REQUIRED_DOCUMENTS.get(product, set()))
    result["missing_document_types"] = sorted(REQUIRED_DOCUMENTS.get(product, set()) - present)
    return result


async def list_my_applications(user: Dict[str, Any]) -> List[Dict[str, Any]]:
    rows = await database.find_many("worker_applications", {"user_id": _user_id(user)})
    return [public_application(row) for row in sorted(rows, key=lambda item: str(item.get("updated_at") or ""), reverse=True)]


async def save_worker_application(payload: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    if user.get("role") != "passenger":
        raise PermissionError("Applications begin from a Customer account. Existing work accounts keep their current product access.")
    if not payload.get("accepted_terms"):
        raise ValueError("Accept the application declaration before continuing.")
    product = str(payload.get("product") or "")
    if product not in REQUIRED_DOCUMENTS:
        raise ValueError("Unsupported worker product.")
    if product in {"courier", "driver"} and not str(payload.get("vehicle") or "").strip():
        raise ValueError("Vehicle details are required for this application.")
    if product == "merchant" and not all(str(payload.get(key) or "").strip() for key in ("business_name", "business_address", "business_registration_number")):
        raise ValueError("Business name, address and registration number are required.")

    existing = await database.find_one(
        "worker_applications",
        {"user_id": _user_id(user), "product": product},
    )
    now = now_iso()
    clean_payload = {**payload, "accepted_terms": True}
    if existing:
        if existing.get("status") in {"SUBMITTED", "UNDER_REVIEW", "APPROVED"}:
            raise ValueError("This application is already in review or approved.")
        updated = await database.update_one(
            "worker_applications",
            existing["id"],
            {**clean_payload, "status": "DRAFT", "review_note": None, "updated_at": now},
        )
        return public_application(updated or existing)

    application = {
        "id": new_id(),
        "user_id": _user_id(user),
        "account_email": user.get("email"),
        "status": "DRAFT",
        "documents": [],
        "review_note": None,
        "created_at": now,
        "updated_at": now,
        **clean_payload,
    }
    try:
        saved = await database.insert_one("worker_applications", application)
    except DuplicateKeyError as exc:
        raise ValueError("An application for this product already exists.") from exc
    return public_application(saved)


async def upload_worker_document(
    application_id: str,
    document_type: str,
    upload: UploadFile,
    user: Dict[str, Any],
) -> Dict[str, Any]:
    if document_type not in DOCUMENT_TYPES:
        raise ValueError("Unsupported document type.")
    application = await database.find_one("worker_applications", {"id": application_id})
    if not application:
        raise ValueError("Application not found.")
    if application.get("user_id") != _user_id(user):
        raise PermissionError("You cannot change another applicant's documents.")
    if application.get("status") not in {"DRAFT", "REJECTED"}:
        raise ValueError("Documents cannot be changed while an application is in review.")
    if document_type not in REQUIRED_DOCUMENTS.get(str(application.get("product") or ""), set()):
        raise ValueError("That document is not used for this application.")
    content_type = str(upload.content_type or "").lower()
    if content_type not in ALLOWED_DOCUMENT_TYPES:
        raise ValueError("Upload a JPEG, PNG, WebP or PDF document.")
    file_bytes = await upload.read()
    if not file_bytes:
        raise ValueError("The uploaded document is empty.")
    if len(file_bytes) > MAX_DOCUMENT_BYTES:
        raise ValueError("Documents must be 8 MB or smaller.")

    settings = get_settings()
    config = cloudinary.config(
        cloud_name=settings.cloudinary_cloud_name or None,
        api_key=settings.cloudinary_api_key or None,
        api_secret=settings.cloudinary_api_secret or None,
        secure=True,
    )
    if not (config.cloud_name and config.api_key and config.api_secret):
        raise RuntimeError("Secure document storage is not configured.")
    safe_name = _safe_file_name(upload.filename or "document")

    def upload_to_cloudinary() -> Dict[str, Any]:
        file_obj = io.BytesIO(file_bytes)
        file_obj.name = safe_name
        return cloudinary.uploader.upload(
            file_obj,
            resource_type="auto",
            type="authenticated",
            folder=f"letsgoride/applications/{application.get('product')}",
            use_filename=True,
            unique_filename=True,
        )

    result = await asyncio.to_thread(upload_to_cloudinary)
    if not result.get("secure_url") or not result.get("public_id"):
        raise RuntimeError("Secure document storage did not return a usable file reference.")
    document = {
        "id": new_id(),
        "document_type": document_type,
        "file_name": safe_name,
        "file_url": result["secure_url"],
        "cloudinary_public_id": result["public_id"],
        "delivery_type": "authenticated",
        "resource_type": result.get("resource_type") or "image",
        "format": result.get("format"),
        "version": result.get("version"),
        "content_type": content_type,
        "status": "PENDING",
        "rejection_reason": None,
        "uploaded_at": now_iso(),
    }
    documents = [item for item in application.get("documents", []) if item.get("document_type") != document_type]
    documents.append(document)
    updated = await database.update_one(
        "worker_applications",
        application_id,
        {"documents": documents, "status": "DRAFT", "updated_at": now_iso()},
    )
    if not updated:
        raise ValueError("Application not found.")
    return public_application(updated)


async def submit_worker_application(application_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    application = await database.find_one("worker_applications", {"id": application_id})
    if not application:
        raise ValueError("Application not found.")
    if application.get("user_id") != _user_id(user):
        raise PermissionError("You cannot submit another applicant's application.")
    if application.get("status") not in {"DRAFT", "REJECTED"}:
        raise ValueError("This application has already been submitted.")
    product = str(application.get("product") or "")
    present = {str(item.get("document_type") or "") for item in application.get("documents", [])}
    missing = REQUIRED_DOCUMENTS.get(product, set()) - present
    if missing:
        raise ValueError("Upload every required document before submitting.")
    now = now_iso()
    updated = await database.update_one(
        "worker_applications",
        application_id,
        {"status": "SUBMITTED", "submitted_at": now, "review_note": None, "updated_at": now},
    )
    await write_audit_log(
        actor_user_id=_user_id(user),
        actor_role=user.get("role"),
        action="worker_application_submitted",
        target_type="worker_application",
        target_id=application_id,
        metadata={"product": product},
    )
    return public_application(updated or application)


async def list_worker_applications_for_admin(status: str | None = None, product: str | None = None) -> List[Dict[str, Any]]:
    filters: Dict[str, Any] = {}
    if status:
        if status not in APPLICATION_STATUSES:
            raise ValueError("Unsupported application status.")
        filters["status"] = status
    if product:
        if product not in REQUIRED_DOCUMENTS:
            raise ValueError("Unsupported worker product.")
        filters["product"] = product
    rows = await database.find_many("worker_applications", filters)
    return [public_application(row) for row in sorted(rows, key=lambda item: str(item.get("submitted_at") or item.get("created_at") or ""), reverse=True)]


async def review_worker_application(application_id: str, status: str, note: str | None, admin: Dict[str, Any]) -> Dict[str, Any]:
    if admin.get("role") != "admin":
        raise PermissionError("Administrator access is required.")
    application = await database.find_one("worker_applications", {"id": application_id})
    if not application:
        raise ValueError("Application not found.")
    current = str(application.get("status") or "")
    if current not in {"SUBMITTED", "UNDER_REVIEW"} and not (current == "APPROVED" and status == "APPROVED"):
        raise ValueError("Only submitted applications can be reviewed.")
    if status == "REJECTED" and not str(note or "").strip():
        raise ValueError("A rejection reason is required.")

    now = now_iso()
    updates: Dict[str, Any] = {
        "status": status,
        "review_note": str(note or "").strip() or None,
        "reviewed_by_user_id": _user_id(admin),
        "reviewed_at": now,
        "updated_at": now,
    }
    if status == "APPROVED":
        applicant = await database.find_one("users", {"id": application.get("user_id")})
        if not applicant:
            raise ValueError("Applicant account not found.")
        product = str(application.get("product") or "")
        if applicant.get("role") not in {"passenger", product}:
            raise ValueError("Applicant already belongs to another work product.")
        await database.update_one(
            "users",
            applicant["id"],
            {
                "role": product,
                "verification_status": "approved" if product == "driver" else applicant.get("verification_status", "not_started"),
                "updated_at": now,
            },
        )
        if product == "courier":
            profile = await database.find_one("courier_profiles", {"user_id": applicant["id"]})
            vehicle = str(application.get("vehicle") or "").lower()
            transport_mode = "bicycle" if "bicycle" in vehicle or "bike" in vehicle and "motor" not in vehicle else "van" if "van" in vehicle else "car" if "car" in vehicle else "motorbike"
            profile_updates = {
                "name": application.get("full_name") or applicant.get("name"),
                "transport_mode": transport_mode,
                "vehicle_description": application.get("vehicle"),
                "service_area": application.get("service_area"),
                "status": "APPROVED",
                "online": False,
                "approved_at": now,
                "updated_at": now,
            }
            if profile:
                await database.update_one("courier_profiles", profile["id"], profile_updates)
            else:
                await database.insert_one(
                    "courier_profiles",
                    {"id": new_id(), "user_id": applicant["id"], "completed_deliveries": 0, "rating": None, "created_at": now, **profile_updates},
                )
        elif product == "driver":
            driver = await database.find_one("drivers", {"user_id": applicant["id"]})
            driver_updates = {
                "name": application.get("full_name") or applicant.get("name"),
                "phone": application.get("phone") or applicant.get("phone"),
                "email": applicant.get("email"),
                "city": application.get("service_area") or applicant.get("city"),
                "vehicle": application.get("vehicle"),
                "documents": application.get("documents", []),
                "status": "approved",
                "verified": True,
                "verification_status": "approved",
                "identity_verification_state": "active",
                "verification_provider": "manual",
                "verification_checked_at": now,
                "updated_at": now,
            }
            if driver:
                await database.update_one("drivers", driver["id"], driver_updates)
            else:
                await database.insert_one(
                    "drivers",
                    {"id": new_id(), "user_id": applicant["id"], "rating": 0, "is_demo": False, "created_at": now, **driver_updates},
                )
        updates["approved_at"] = now

    updated = await database.update_one("worker_applications", application_id, updates)
    await write_audit_log(
        actor_user_id=_user_id(admin),
        actor_role=admin.get("role"),
        action="worker_application_reviewed",
        target_type="worker_application",
        target_id=application_id,
        metadata={"product": application.get("product"), "from_status": current, "to_status": status, "note": note},
    )
    await create_app_notification(
        str(application.get("user_id") or ""),
        "worker_application",
        "Application update",
        "Your application was approved. Sign in again to open your work product." if status == "APPROVED" else "Your application status changed. Open Work with LetsGoRide for details.",
        {"application_id": application_id, "application_status": status, "product": application.get("product")},
    )
    return public_application(updated or application)


def _shift_status(shift: Dict[str, Any], now: datetime) -> str:
    if not shift.get("active"):
        return "INACTIVE"
    if _parse_datetime(shift.get("ends_at")) <= now:
        return "COMPLETED"
    if _parse_datetime(shift.get("starts_at")) <= now:
        return "IN_PROGRESS"
    return "UPCOMING"


def public_shift(shift: Dict[str, Any], now: datetime | None = None) -> Dict[str, Any]:
    now = now or datetime.now(timezone.utc)
    result = dict(shift)
    capacity = max(0, int(shift.get("capacity") or 0))
    booked = max(0, int(shift.get("booked_count") or 0))
    result["remaining_places"] = max(0, capacity - booked)
    result["status"] = _shift_status(shift, now)
    result["booking_open"] = (
        result["status"] == "UPCOMING"
        and result["remaining_places"] > 0
        and now < _parse_datetime(shift.get("starts_at")) - timedelta(minutes=int(shift.get("booking_cutoff_minutes") or 0))
    )
    return result


async def create_courier_shift(payload: Dict[str, Any], admin: Dict[str, Any]) -> Dict[str, Any]:
    if admin.get("role") != "admin":
        raise PermissionError("Administrator access is required.")
    starts_at = _parse_datetime(payload.get("starts_at"))
    ends_at = _parse_datetime(payload.get("ends_at"))
    if ends_at <= starts_at:
        raise ValueError("Shift end must be later than shift start.")
    if starts_at <= datetime.now(timezone.utc):
        raise ValueError("New shifts must start in the future.")
    now = now_iso()
    shift = {
        "id": new_id(),
        "booked_count": 0,
        "created_by_user_id": _user_id(admin),
        "created_at": now,
        "updated_at": now,
        **payload,
        "starts_at": starts_at.isoformat(),
        "ends_at": ends_at.isoformat(),
        "incentive_usd": round(float(payload["incentive_usd"]), 2) if payload.get("incentive_usd") is not None else None,
    }
    saved = await database.insert_one("courier_shifts", shift)
    await write_audit_log(actor_user_id=_user_id(admin), actor_role="admin", action="courier_shift_created", target_type="courier_shift", target_id=saved["id"], metadata={"zone": saved.get("zone")})
    return public_shift(saved)


async def update_courier_shift(shift_id: str, payload: Dict[str, Any], admin: Dict[str, Any]) -> Dict[str, Any]:
    if admin.get("role") != "admin":
        raise PermissionError("Administrator access is required.")
    shift = await database.find_one("courier_shifts", {"id": shift_id})
    if not shift:
        raise ValueError("Shift not found.")
    updates = dict(payload)
    starts_at = _parse_datetime(updates.get("starts_at") or shift.get("starts_at"))
    ends_at = _parse_datetime(updates.get("ends_at") or shift.get("ends_at"))
    if ends_at <= starts_at:
        raise ValueError("Shift end must be later than shift start.")
    capacity = int(updates.get("capacity") or shift.get("capacity") or 0)
    if capacity < int(shift.get("booked_count") or 0):
        raise ValueError("Capacity cannot be lower than existing bookings.")
    updates.update({"starts_at": starts_at.isoformat(), "ends_at": ends_at.isoformat(), "updated_at": now_iso()})
    updated = await database.update_one("courier_shifts", shift_id, updates)
    await write_audit_log(actor_user_id=_user_id(admin), actor_role="admin", action="courier_shift_updated", target_type="courier_shift", target_id=shift_id, metadata={"fields": sorted(updates.keys())})
    return public_shift(updated or shift)


async def list_courier_shifts(*, include_inactive: bool = False) -> List[Dict[str, Any]]:
    filters = {} if include_inactive else {"active": True}
    rows = await database.find_many("courier_shifts", filters)
    now = datetime.now(timezone.utc)
    return [public_shift(row, now) for row in sorted(rows, key=lambda item: str(item.get("starts_at") or ""))]


async def _require_approved_courier(user: Dict[str, Any]) -> Dict[str, Any]:
    if user.get("role") != "courier":
        raise PermissionError("A Courier account is required for shifts.")
    profile = await database.find_one("courier_profiles", {"user_id": _user_id(user)})
    if not profile or profile.get("status") != "APPROVED":
        raise PermissionError("Courier approval is required before booking shifts.")
    return profile


async def available_courier_shifts(user: Dict[str, Any]) -> List[Dict[str, Any]]:
    await _require_approved_courier(user)
    bookings = await database.find_many("courier_shift_bookings", {"courier_user_id": _user_id(user)})
    booked_shift_ids = {item.get("shift_id") for item in bookings if item.get("status") == "BOOKED"}
    return [shift for shift in await list_courier_shifts() if shift.get("status") in {"UPCOMING", "IN_PROGRESS"} and shift.get("id") not in booked_shift_ids]


async def book_courier_shift(shift_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    await _require_approved_courier(user)
    shift = await database.find_one("courier_shifts", {"id": shift_id})
    if not shift:
        raise ValueError("Shift not found.")
    public = public_shift(shift)
    if not public.get("booking_open"):
        raise ValueError("This shift is full or no longer open for booking.")
    existing = await database.find_one("courier_shift_bookings", {"shift_id": shift_id, "courier_user_id": _user_id(user)})
    if existing and existing.get("status") == "BOOKED":
        return {**existing, "shift": public}

    booked_count = int(shift.get("booked_count") or 0)
    reserved = await database.update_one_if(
        "courier_shifts",
        {"id": shift_id, "active": True, "booked_count": booked_count},
        {"booked_count": booked_count + 1, "updated_at": now_iso()},
    )
    if not reserved:
        raise ValueError("Shift availability changed. Refresh and try again.")
    now = now_iso()
    try:
        if existing:
            booking = await database.update_one("courier_shift_bookings", existing["id"], {"status": "BOOKED", "booked_at": now, "cancelled_at": None, "updated_at": now})
        else:
            booking = await database.insert_one(
                "courier_shift_bookings",
                {"id": new_id(), "shift_id": shift_id, "courier_user_id": _user_id(user), "status": "BOOKED", "booked_at": now, "cancelled_at": None, "created_at": now, "updated_at": now},
            )
    except DuplicateKeyError as exc:
        await _decrement_shift_booking_count(shift_id)
        raise ValueError("This shift is already booked.") from exc
    return {**booking, "shift": public_shift(reserved)}


async def cancel_courier_shift_booking(booking_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    await _require_approved_courier(user)
    booking = await database.find_one("courier_shift_bookings", {"id": booking_id})
    if not booking:
        raise ValueError("Shift booking not found.")
    if booking.get("courier_user_id") != _user_id(user):
        raise PermissionError("You cannot cancel another courier's shift.")
    if booking.get("status") != "BOOKED":
        raise ValueError("Only an upcoming booked shift can be cancelled.")
    shift = await database.find_one("courier_shifts", {"id": booking.get("shift_id")})
    if not shift or _parse_datetime(shift.get("starts_at")) <= datetime.now(timezone.utc):
        raise ValueError("A shift cannot be cancelled after it starts.")
    now = now_iso()
    updated = await database.update_one_if(
        "courier_shift_bookings",
        {"id": booking_id, "status": "BOOKED"},
        {"status": "CANCELLED", "cancelled_at": now, "updated_at": now},
    )
    if not updated:
        raise ValueError("Shift booking status changed. Refresh and try again.")
    count = await _decrement_shift_booking_count(shift["id"])
    return {**updated, "shift": public_shift({**shift, "booked_count": count})}


async def _decrement_shift_booking_count(shift_id: str) -> int:
    for _ in range(6):
        current = await database.find_one("courier_shifts", {"id": shift_id})
        if not current:
            return 0
        booked_count = max(0, int(current.get("booked_count") or 0))
        if booked_count == 0:
            return 0
        updated = await database.update_one_if(
            "courier_shifts",
            {"id": shift_id, "booked_count": booked_count},
            {"booked_count": booked_count - 1, "updated_at": now_iso()},
        )
        if updated:
            return int(updated.get("booked_count") or 0)
    raise ValueError("Shift capacity changed. Refresh and try again.")


async def my_courier_shift_bookings(user: Dict[str, Any]) -> List[Dict[str, Any]]:
    await _require_approved_courier(user)
    rows = await database.find_many("courier_shift_bookings", {"courier_user_id": _user_id(user)})
    now = datetime.now(timezone.utc)
    result = []
    for booking in rows:
        shift = await database.find_one("courier_shifts", {"id": booking.get("shift_id")})
        if not shift:
            continue
        status = str(booking.get("status") or "")
        if status == "BOOKED" and _parse_datetime(shift.get("ends_at")) <= now:
            status = "COMPLETED"
        result.append({**booking, "status": status, "shift": public_shift(shift, now)})
    return sorted(result, key=lambda item: str((item.get("shift") or {}).get("starts_at") or ""), reverse=True)
