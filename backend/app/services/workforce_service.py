from __future__ import annotations

import asyncio
import io
from typing import Any, Dict, List

import cloudinary
import cloudinary.uploader
from fastapi import UploadFile
from pymongo.errors import DuplicateKeyError

from app.config import get_settings
from app.database import database
from app.domain.zimbabwe_operations import SERVICE_AREAS, canonical_service_area, validate_vehicle_type
from app.services.audit_service import write_audit_log
from app.services.notification_service import create_app_notification
from app.services.upload_security_service import validate_upload
from app.services.work_product_service import approved_work_products, with_approved_work_product
from app.services.workforce_shift_service import (
    available_courier_shifts as available_courier_shifts,
    book_courier_shift as book_courier_shift,
    cancel_courier_shift_booking as cancel_courier_shift_booking,
    create_courier_shift as create_courier_shift,
    list_courier_shifts as list_courier_shifts,
    my_courier_shift_bookings as my_courier_shift_bookings,
    public_shift as public_shift,
    update_courier_shift as update_courier_shift,
)
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


def _user_id(user: Dict[str, Any]) -> str:
    return str(user.get("id") or "")


def _public_document(document: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": document.get("id"),
        "document_type": document.get("document_type"),
        "file_name": document.get("file_name"),
        "has_file": bool(
            document.get("cloudinary_public_id")
            or (document.get("legacy_local_document") is True and document.get("storage_path"))
        ),
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
    current_role = str(user.get("role") or "passenger").strip().lower()
    approved_products = set(approved_work_products(user))
    if current_role not in {"passenger", "driver", "courier"}:
        raise PermissionError("Only Customer, Driver or Courier accounts can start a Driver or Courier application.")
    if not payload.get("accepted_terms"):
        raise ValueError("Accept the application declaration before continuing.")
    product = str(payload.get("product") or "")
    if product not in REQUIRED_DOCUMENTS:
        raise ValueError("Unsupported worker product.")
    if product == "merchant" and current_role != "passenger":
        raise PermissionError("Merchant onboarding requires a Customer account without another work product.")
    if product in approved_products:
        raise ValueError("This work product is already approved for your account.")
    legacy_area = str(payload.get("service_area") or "").strip().lower()
    inferred_area_id = next((area_id for area_id, name in SERVICE_AREAS.items() if legacy_area == name.lower() or legacy_area.startswith(f"{name.lower()} ")), "")
    payload["service_area_id"] = str(payload.get("service_area_id") or inferred_area_id)
    payload["service_area"] = canonical_service_area(payload["service_area_id"])
    if product in {"courier", "driver"}:
        legacy_vehicle = str(payload.get("vehicle") or "").lower()
        if product == "driver":
            inferred_vehicle = next(
                (candidate for candidate in ("minibus", "hatchback", "pickup", "suv", "van", "sedan") if candidate in legacy_vehicle),
                "hatchback" if "aqua" in legacy_vehicle else "sedan",
            )
        else:
            inferred_vehicle = next(
                (candidate for candidate in ("motorbike", "bicycle", "scooter", "pickup", "van", "car") if candidate in legacy_vehicle),
                "motorbike",
            )
        payload["vehicle_type"] = validate_vehicle_type(product, str(payload.get("vehicle_type") or inferred_vehicle))
        details = str(payload.get("vehicle_details") or payload.get("vehicle") or "").strip()
        payload["vehicle_details"] = details or None
        payload["vehicle"] = f"{payload['vehicle_type'].replace('-', ' ').title()} · {details}" if details else payload["vehicle_type"].replace("-", " ").title()
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
    validated = await validate_upload(upload, max_bytes=MAX_DOCUMENT_BYTES, allow_pdf=True, stem=upload.filename or "document")
    file_bytes = validated.data

    settings = get_settings()
    config = cloudinary.config(
        cloud_name=settings.cloudinary_cloud_name or None,
        api_key=settings.cloudinary_api_key or None,
        api_secret=settings.cloudinary_api_secret or None,
        secure=True,
    )
    if not (config.cloud_name and config.api_key and config.api_secret):
        raise RuntimeError("Secure document storage is not configured.")
    safe_name = validated.file_name

    def upload_to_cloudinary() -> Dict[str, Any]:
        file_obj = io.BytesIO(file_bytes)
        file_obj.name = safe_name
        return cloudinary.uploader.upload(
            file_obj,
            resource_type=validated.resource_type,
            type="authenticated",
            folder=f"letsgoride/applications/{application.get('product')}",
            use_filename=True,
            unique_filename=True,
        )

    try:
        result = await asyncio.to_thread(upload_to_cloudinary)
    except Exception:
        raise RuntimeError("Secure document upload is temporarily unavailable.") from None
    if not result.get("secure_url") or not result.get("public_id"):
        raise RuntimeError("Secure document storage did not return a usable file reference.")
    document = {
        "id": new_id(),
        "document_type": document_type,
        "file_name": safe_name,
        "cloudinary_public_id": result["public_id"],
        "delivery_type": "authenticated",
        "resource_type": result.get("resource_type") or "image",
        "format": result.get("format"),
        "version": result.get("version"),
        "content_type": validated.content_type,
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
        current_role = str(applicant.get("role") or "passenger").strip().lower()
        approved_products = set(approved_work_products(applicant))
        if product in {"driver", "courier"}:
            if current_role not in {"passenger", "driver", "courier"}:
                raise ValueError("Applicant already belongs to an incompatible work product.")
            approved_products = set(with_approved_work_product(applicant, product))
            next_role = product if current_role == "passenger" else current_role
        else:
            if current_role not in {"passenger", product}:
                raise ValueError("Applicant already belongs to another work product.")
            next_role = product
        await database.update_one(
            "users",
            applicant["id"],
            {
                "role": next_role,
                "work_products": sorted(approved_products),
                "name": application.get("full_name") or applicant.get("name"),
                "phone": application.get("phone") or applicant.get("phone"),
                "city": application.get("service_area") or applicant.get("city"),
                "verification_status": "approved" if product == "driver" else applicant.get("verification_status", "not_started"),
                "updated_at": now,
            },
        )
        if product == "courier":
            profile = await database.find_one("courier_profiles", {"user_id": applicant["id"]})
            vehicle_type = str(application.get("vehicle_type") or "motorbike")
            transport_mode = "bicycle" if vehicle_type == "bicycle" else "van" if vehicle_type == "van" else "car" if vehicle_type in {"car", "pickup"} else "motorbike"
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
                    {"id": new_id(), "user_id": applicant["id"], "rating": 0, "created_at": now, **driver_updates},
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
        "Your application was approved. Open Account to use your approved work mode." if status == "APPROVED" else "Your application status changed. Open Work with LetsGoRide for details.",
        {"application_id": application_id, "application_status": status, "product": application.get("product")},
    )
    return public_application(updated or application)
