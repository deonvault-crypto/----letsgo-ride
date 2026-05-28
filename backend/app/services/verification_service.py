import asyncio
import hashlib
import hmac
import time
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Tuple

import requests
from fastapi import UploadFile

from app.config import get_settings
from app.database import database
from app.services.email_service import send_driver_verification_status_email
from app.services.notification_service import create_app_notification, notify_admins
from app.services.audit_service import write_audit_log
from app.utils import new_id, now_iso


settings = get_settings()

REQUIRED_DOCUMENTS = [
    "selfie",
    "identity_document",
    "driver_license",
    "vehicle_registration_or_logbook",
    "vehicle_photo_optional",
]

DOCUMENT_STATUSES = {"pending", "accepted", "rejected"}
VERIFICATION_STATUSES = {
    "not_started",
    "pending_uploads",
    "pending_auto_check",
    "needs_review",
    "approved",
    "rejected",
    "needs_resubmission",
}
STORAGE_ROOT = Path(__file__).resolve().parents[2] / "storage" / "verification_documents"
REQUIRED_DOCUMENT_TYPES = set(REQUIRED_DOCUMENTS) - {"vehicle_photo_optional"}
ALLOWED_DOCUMENT_EXTENSIONS = {"pdf", "jpg", "jpeg", "png", "heic", "heif"}
STATUS_ALIASES = {
    "active": "approved",
    "complete": "approved",
    "completed": "approved",
    "declined": "rejected",
    "denied": "rejected",
    "manual_review": "needs_review",
    "review": "needs_review",
    "resubmission_required": "needs_resubmission",
    "verified": "approved",
}
DOCUMENT_TYPE_ALIASES = {
    "driver_licence": "driver_license",
    "drivers_license": "driver_license",
    "drivers_licence": "driver_license",
    "id": "identity_document",
    "id_document": "identity_document",
    "identity": "identity_document",
    "licence": "driver_license",
    "license": "driver_license",
    "registration": "vehicle_registration_or_logbook",
    "registration_logbook": "vehicle_registration_or_logbook",
    "vehicle_logbook": "vehicle_registration_or_logbook",
    "vehicle_photo": "vehicle_photo_optional",
}


def default_verification_fields() -> Dict[str, Any]:
    return {
        "verification_status": "not_started",
        "verification_provider": "manual",
        "verification_submitted_at": None,
        "verification_checked_at": None,
        "verification_notes": None,
        "admin_verification_notes": None,
        "identity_verification_state": "pending_verification",
        "documents": [],
        "verification_risk_score": None,
        "verification_risk_flags": [],
    }


def manual_verification_documents(documents: Any) -> List[Dict[str, Any]]:
    normalized: List[Dict[str, Any]] = []
    for document in _iter_document_items(documents):
        normalized_document = _normalize_document(document)
        if normalized_document:
            normalized.append(normalized_document)
    return normalized


def _iter_document_items(documents: Any) -> List[Dict[str, Any]]:
    if not documents:
        return []
    if isinstance(documents, Mapping):
        items: List[Dict[str, Any]] = []
        for document_type, value in documents.items():
            if isinstance(value, Mapping):
                item = dict(value)
                item.setdefault("document_type", document_type)
                items.append(item)
            elif value:
                file_url = str(value)
                items.append(
                    {
                        "document_type": document_type,
                        "file_url": file_url,
                        "file_name": _file_name_from_url(file_url, str(document_type)),
                    }
                )
        return items
    if isinstance(documents, (list, tuple)):
        return [dict(document) for document in documents if isinstance(document, Mapping)]
    return []


def _normalize_document_type(document_type: Any) -> Optional[str]:
    normalized = str(document_type or "").strip().lower().replace("-", "_").replace(" ", "_")
    normalized = DOCUMENT_TYPE_ALIASES.get(normalized, normalized)
    return normalized if normalized in REQUIRED_DOCUMENTS else None


def _normalize_document_status(status: Any) -> str:
    normalized = str(status or "").strip().lower()
    return normalized if normalized in DOCUMENT_STATUSES else "pending"


def _file_name_from_url(file_url: str, document_type: str) -> str:
    file_name = Path(file_url.split("?", 1)[0]).name
    return _safe_file_name(file_name) if file_name else f"{document_type}.jpg"


def _normalize_document(document: Mapping[str, Any]) -> Optional[Dict[str, Any]]:
    document_type = _normalize_document_type(
        document.get("document_type") or document.get("type") or document.get("kind")
    )
    if not document_type:
        return None

    file_url = document.get("file_url") or document.get("url") or document.get("secure_url")
    file_name = (
        document.get("file_name")
        or document.get("filename")
        or document.get("name")
        or (_file_name_from_url(str(file_url), document_type) if file_url else f"{document_type}.jpg")
    )
    normalized = dict(document)
    normalized.update(
        {
            "document_type": document_type,
            "file_name": str(file_name),
            "file_url": file_url,
            "status": _normalize_document_status(document.get("status")),
            "rejection_reason": document.get("rejection_reason"),
        }
    )
    return normalized


def normalize_verification_status(status: Any, documents: Optional[List[Dict[str, Any]]] = None) -> str:
    normalized = str(status or "").strip().lower().replace("-", "_").replace(" ", "_")
    if normalized in {"pending", "submitted"}:
        return "pending_auto_check" if documents and _has_all_required_documents(documents) else "pending_uploads"
    normalized = STATUS_ALIASES.get(normalized, normalized)
    return normalized if normalized in VERIFICATION_STATUSES else "not_started"


def _document_types(documents: List[Dict[str, Any]]) -> set[str]:
    return {document.get("document_type") for document in manual_verification_documents(documents)}


def _has_all_required_documents(documents: List[Dict[str, Any]]) -> bool:
    return REQUIRED_DOCUMENT_TYPES.issubset(_document_types(documents))


def _safe_file_name(file_name: str) -> str:
    return "".join(character for character in file_name if character.isalnum() or character in ("-", "_", ".")).strip(".") or "document"


def _cloudinary_configured() -> bool:
    return bool(settings.cloudinary_cloud_name and settings.cloudinary_api_key and settings.cloudinary_api_secret)


def _cloudinary_upload(file_bytes: bytes, filename: str, content_type: Optional[str], document_type: str) -> Dict[str, Any]:
    if not _cloudinary_configured():
        raise RuntimeError("Cloudinary is not configured.")

    url = f"https://api.cloudinary.com/v1_1/{settings.cloudinary_cloud_name}/auto/upload"
    timestamp = int(time.time())
    folder = f"letsgoride/verification/{document_type}"
    signature_base = f"folder={folder}&timestamp={timestamp}"
    signature = hmac.new(settings.cloudinary_api_secret.encode(), signature_base.encode(), hashlib.sha1).hexdigest()
    payload = {
        "api_key": settings.cloudinary_api_key,
        "timestamp": timestamp,
        "folder": folder,
        "signature": signature,
    }
    files = {"file": (filename, file_bytes, content_type or "application/octet-stream")}
    response = requests.post(url, data=payload, files=files, timeout=30)
    response.raise_for_status()
    return response.json()


async def _upload_to_cloudinary(upload: UploadFile, document_type: str) -> Dict[str, Any]:
    file_bytes = await upload.read()
    filename = upload.filename or _safe_file_name("document")
    return await asyncio.to_thread(_cloudinary_upload, file_bytes, filename, upload.content_type, document_type)


def _evaluate_document_risk(documents: List[Dict[str, Any]]) -> Tuple[float, List[str]]:
    risk_score = 0.0
    flags: List[str] = []
    documents = manual_verification_documents(documents)

    type_counts: Dict[str, int] = {}
    for document in documents:
        doc_type = document.get("document_type")
        if doc_type:
            type_counts[doc_type] = type_counts.get(doc_type, 0) + 1
    duplicates = [doc_type for doc_type, count in type_counts.items() if count > 1]
    if duplicates:
        flags.append("duplicate_document_type")
        risk_score += min(0.25 * len(duplicates), 0.4)

    for document in documents:
        file_name = document.get("file_name", "")
        if "." in file_name:
            extension = file_name.rsplit(".", 1)[-1].lower()
            if extension not in ALLOWED_DOCUMENT_EXTENSIONS:
                flags.append("unsupported_file_type")
                risk_score += 0.3
                break

    if not _has_all_required_documents(documents):
        flags.append("missing_required_documents")
        risk_score += 0.2

    if settings.enable_face_ai and _has_all_required_documents(documents):
        face_ai = _run_face_ai_check(documents)
        if face_ai and not face_ai.get("passed", True):
            flags.append("face_match_low")
            risk_score += 0.35

    return min(risk_score, 1.0), flags


def _run_face_ai_check(documents: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not settings.enable_face_ai:
        return None
    documents = manual_verification_documents(documents)

    has_selfie = any(document.get("document_type") == "selfie" for document in documents)
    has_identity = any(document.get("document_type") == "identity_document" for document in documents)
    if not has_selfie or not has_identity:
        return None

    return {"passed": True, "confidence": 0.92, "model": "insightface_stub"}


def public_verification_status(record: Optional[Dict[str, Any]]) -> str:
    if not record:
        return "not_started"

    documents = manual_verification_documents(record.get("documents", []))
    status = normalize_verification_status(record.get("verification_status"), documents)
    if status != "not_started":
        return status
    if record.get("verified"):
        return "approved"

    if documents:
        return "pending_auto_check" if _has_all_required_documents(documents) else "pending_uploads"
    return "not_started"


def public_identity_verification_state(status: str) -> str:
    return "active" if status == "approved" else "pending_verification"


def public_verification(driver: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not driver:
        return {
            **default_verification_fields(),
            "required_documents": REQUIRED_DOCUMENTS,
        }

    status = public_verification_status(driver)
    documents = [
        {
            "id": document.get("id"),
            "document_type": document.get("document_type"),
            "file_name": document.get("file_name"),
            "file_url": document.get("file_url"),
            "cloudinary_public_id": document.get("cloudinary_public_id"),
            "uploaded_at": document.get("uploaded_at"),
            "status": document.get("status", "pending"),
            "rejection_reason": document.get("rejection_reason"),
            "content_type": document.get("content_type"),
        }
        for document in manual_verification_documents(driver.get("documents", []))
    ]

    return {
        "driver_id": driver.get("id"),
        "driver_status": driver.get("status"),
        "verified": driver.get("verified", False),
        "verification_status": status,
        "verification_provider": driver.get("verification_provider", "manual"),
        "verification_submitted_at": driver.get("verification_submitted_at"),
        "verification_checked_at": driver.get("verification_checked_at"),
        "verification_notes": driver.get("verification_notes"),
        "identity_verification_state": public_identity_verification_state(status),
        "documents": documents,
        "required_documents": REQUIRED_DOCUMENTS,
        "verification_risk_score": driver.get("verification_risk_score"),
        "verification_risk_flags": driver.get("verification_risk_flags", []),
    }


async def get_driver_for_user(user: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    return await database.find_one("drivers", {"user_id": user["id"]})


async def ensure_driver_for_user(user: Dict[str, Any], payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    payload = payload or {}
    existing = await get_driver_for_user(user)
    if existing:
        updates: Dict[str, Any] = {}
        for key in ("city", "vehicle"):
            if payload.get(key):
                updates[key] = payload[key]
        if updates:
            updates["updated_at"] = now_iso()
            return await database.update_one("drivers", existing["id"], updates) or existing
        return existing

    timestamp = now_iso()
    application = {
        "id": new_id(),
        "user_id": user["id"],
        "status": "pending_review",
        "is_demo": False,
        "created_at": timestamp,
        "updated_at": timestamp,
        "name": user.get("name") or "Driver",
        "phone": user.get("phone") or "",
        "city": payload.get("city") or user.get("city") or "Harare",
        "vehicle": payload.get("vehicle"),
        "experience": None,
    }
    await database.insert_one("driver_applications", application)

    driver = {
        "id": new_id(),
        "user_id": user["id"],
        "application_id": application["id"],
        "name": user.get("name") or "Driver",
        "phone": user.get("phone") or "",
        "email": user.get("email") or "",
        "city": payload.get("city") or user.get("city") or "Harare",
        "status": "pending_review",
        "verified": False,
        "rating": 0,
        "is_demo": False,
        "created_at": timestamp,
        "updated_at": timestamp,
        **default_verification_fields(),
    }
    return await database.insert_one("drivers", driver)


def merge_documents(existing: List[Dict[str, Any]], incoming: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    documents = manual_verification_documents(existing)
    timestamp = now_iso()
    for document in manual_verification_documents(incoming):
        documents.append(
            {
                "id": new_id(),
                "document_type": document["document_type"],
                "file_name": document["file_name"],
                "file_url": document.get("file_url"),
                "storage_path": document.get("storage_path"),
                "content_type": document.get("content_type"),
                "uploaded_at": timestamp,
                "status": "pending",
                "rejection_reason": None,
            }
        )
    return documents


def _next_status_after_upload(driver: Dict[str, Any], documents: List[Dict[str, Any]]) -> str:
    current_status = normalize_verification_status(driver.get("verification_status"), documents)
    if current_status in {"rejected", "needs_resubmission"}:
        return "needs_resubmission"
    return "pending_uploads"


def _status_from_documents(documents: List[Dict[str, Any]]) -> str:
    if _has_all_required_documents(documents):
        return "pending_auto_check"
    return "pending_uploads"


async def submit_manual_verification(user: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
    driver = await ensure_driver_for_user(user, payload)
    timestamp = now_iso()
    documents = merge_documents(driver.get("documents", []), payload.get("documents", []))
    verification_status = _status_from_documents(documents)
    risk_score, risk_flags = _evaluate_document_risk(documents) if _has_all_required_documents(documents) else (None, [])
    verified = verification_status == "approved"
    updates: Dict[str, Any] = {
        "verification_provider": "manual",
        "verification_status": verification_status,
        "verification_risk_score": risk_score,
        "verification_risk_flags": risk_flags,
        "identity_verification_state": "active" if verified else "pending_verification",
        "verification_submitted_at": timestamp,
        "verification_notes": payload.get("verification_notes"),
        "documents": documents,
        "verified": verified,
        "status": "approved" if verified else driver.get("status"),
        "updated_at": timestamp,
    }
    updated = await database.update_one("drivers", driver["id"], updates) or driver
    await database.update_one(
        "users",
        user["id"],
        {
            "verification_status": verification_status,
            "verification_provider": "manual",
            "identity_verification_state": "active" if verified else "pending_verification",
            "updated_at": timestamp,
        },
    )
    await write_audit_log(
        actor_user_id=user["id"],
        actor_role=user.get("role"),
        action="driver_verification_submitted",
        target_type="driver",
        target_id=driver["id"],
        metadata={"document_count": len(documents), "verification_status": verification_status},
    )
    if driver.get("email"):
        await send_driver_verification_status_email(driver["email"], verified)
    await notify_admins(
        "driver_verification",
        "New driver verification",
        f"{user.get('name') or 'A driver'} submitted documents for review.",
        {"driver_id": driver["id"]},
    )
    return updated


async def save_uploaded_document(
    user: Dict[str, Any],
    document_type: str,
    upload: UploadFile,
) -> Dict[str, Any]:
    driver = await ensure_driver_for_user(user)
    document_id = new_id()
    timestamp = now_iso()
    safe_name = _safe_file_name(upload.filename or "document")

    document: Dict[str, Any] = {
        "id": document_id,
        "document_type": document_type,
        "file_name": upload.filename or safe_name,
        "uploaded_at": timestamp,
        "status": "pending",
        "rejection_reason": None,
        "content_type": upload.content_type,
    }

    if _cloudinary_configured():
        cloudinary_result = await _upload_to_cloudinary(upload, document_type)
        if not cloudinary_result.get("secure_url") or not cloudinary_result.get("public_id"):
            raise RuntimeError("Cloudinary upload did not return document metadata.")
        document["file_url"] = cloudinary_result.get("secure_url")
        document["cloudinary_public_id"] = cloudinary_result.get("public_id")
        document["resource_type"] = cloudinary_result.get("resource_type")
    else:
        target_dir = STORAGE_ROOT / user["id"]
        target_dir.mkdir(parents=True, exist_ok=True)
        target_path = target_dir / f"{document_id}_{safe_name}"
        content = await upload.read()
        target_path.write_bytes(content)
        document["storage_path"] = str(target_path)
        document["file_url"] = None

    documents = [*manual_verification_documents(driver.get("documents", [])), document]
    verification_status = _next_status_after_upload(driver, documents)
    risk_score, risk_flags = _evaluate_document_risk(documents) if _has_all_required_documents(documents) else (None, [])

    updated = await database.update_one(
        "drivers",
        driver["id"],
        {
            "documents": documents,
            "verification_provider": "manual",
            "verification_status": verification_status,
            "verification_risk_score": risk_score,
            "verification_risk_flags": risk_flags,
            "identity_verification_state": "pending_verification",
            "updated_at": timestamp,
        },
    )
    await database.update_one(
        "users",
        user["id"],
        {
            "verification_status": verification_status,
            "verification_provider": "manual",
            "identity_verification_state": "pending_verification",
            "updated_at": timestamp,
        },
    )
    await write_audit_log(
        actor_user_id=user["id"],
        actor_role=user.get("role"),
        action="driver_verification_document_uploaded",
        target_type="driver",
        target_id=driver["id"],
        metadata={"document_id": document_id, "document_type": document_type},
    )
    return public_verification(updated or driver)["documents"][-1]


async def apply_admin_verification_status(
    admin: Dict[str, Any],
    driver: Dict[str, Any],
    status: str,
    admin_notes: Optional[str],
    rejection_reason: Optional[str],
    document_id: Optional[str],
    document_status: Optional[str],
) -> Dict[str, Any]:
    timestamp = now_iso()
    provider = "manual"
    documents = manual_verification_documents(driver.get("documents", []))
    if document_id and document_status:
        for document in documents:
            if document.get("id") == document_id:
                document["status"] = document_status
                document["rejection_reason"] = rejection_reason if document_status == "rejected" else None
                await write_audit_log(
                    actor_user_id=admin["id"],
                    actor_role=admin.get("role"),
                    action=f"verification_document_{document_status}",
                    target_type="verification_document",
                    target_id=document_id,
                    metadata={"driver_id": driver["id"]},
                )
                break

    identity_state = "active" if status == "approved" else "pending_verification"
    verified = status == "approved"
    updates = {
        "verification_status": status,
        "identity_verification_state": identity_state,
        "verification_checked_at": timestamp,
        "admin_verification_notes": admin_notes,
        "documents": documents,
        "verified": verified,
        "status": "approved" if verified else driver.get("status"),
        "updated_at": timestamp,
    }
    updated = await database.update_one("drivers", driver["id"], updates) or driver
    if driver.get("user_id"):
        await database.update_one(
            "users",
            driver["user_id"],
            {
                "verification_status": status,
                "verification_provider": provider,
                "identity_verification_state": identity_state,
                "updated_at": timestamp,
            },
        )
    if driver.get("application_id"):
        await database.update_one(
            "driver_applications",
            driver["application_id"],
            {"status": updates["status"], "updated_at": timestamp},
        )
    await write_audit_log(
        actor_user_id=admin["id"],
        actor_role=admin.get("role"),
        action=f"driver_verification_{status}",
        target_type="driver",
        target_id=driver["id"],
        metadata={"admin_notes": admin_notes, "rejection_reason": rejection_reason},
    )
    if driver.get("user_id"):
        title = "Driver verification approved" if status == "approved" else "Verification needs attention"
        body = "You can now post rides on LetsGoRide." if status == "approved" else "Please review your documents and resubmit."
        await create_app_notification(
            driver["user_id"],
            "driver_verification",
            title,
            body,
            {"driver_id": driver["id"], "verification_status": status},
        )
        user = await database.find_one("users", {"id": driver["user_id"]})
        if user and user.get("email"):
            await send_driver_verification_status_email(user["email"], status == "approved")
    return updated
