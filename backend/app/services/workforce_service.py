from __future__ import annotations

import asyncio
import io
from typing import Any, Dict

import cloudinary
import cloudinary.uploader
from fastapi import UploadFile

from app.config import get_settings
from app.database import database
from app.services.upload_security_service import validate_upload
from app.services.workforce_application_service import (
    APPLICATION_STATUSES as APPLICATION_STATUSES,
    REQUIRED_DOCUMENTS as REQUIRED_DOCUMENTS,
    list_my_applications as list_my_applications,
    list_worker_applications_for_admin as list_worker_applications_for_admin,
    public_application as public_application,
    save_worker_application as save_worker_application,
    submit_worker_application as submit_worker_application,
)
from app.services.workforce_review_service import (
    review_worker_application as review_worker_application,
)
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


DOCUMENT_TYPES = {
    "identity_document",
    "selfie",
    "driver_licence",
    "vehicle_registration",
    "business_registration",
}
MAX_DOCUMENT_BYTES = 8 * 1024 * 1024


def _user_id(user: Dict[str, Any]) -> str:
    return str(user.get("id") or "")


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
    validated = await validate_upload(
        upload,
        max_bytes=MAX_DOCUMENT_BYTES,
        allow_pdf=True,
        stem=upload.filename or "document",
    )
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
    documents = [
        item
        for item in application.get("documents", [])
        if item.get("document_type") != document_type
    ]
    documents.append(document)
    updated = await database.update_one(
        "worker_applications",
        application_id,
        {"documents": documents, "status": "DRAFT", "updated_at": now_iso()},
    )
    if not updated:
        raise ValueError("Application not found.")
    return public_application(updated)
