from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import UploadFile

from app.database import database
from app.services.audit_service import write_audit_log
from app.utils import new_id, now_iso


REQUIRED_DOCUMENTS = [
    "identity_document",
    "driver_license",
    "vehicle_registration_or_logbook",
    "vehicle_photo_optional",
]

DOCUMENT_STATUSES = {"pending", "accepted", "rejected"}
VERIFICATION_STATUSES = {"not_started", "pending", "needs_review", "verified", "rejected"}
STORAGE_ROOT = Path(__file__).resolve().parents[2] / "storage" / "verification_documents"


def default_verification_fields() -> Dict[str, Any]:
    return {
        "verification_status": "not_started",
        "verification_provider": "manual",
        "verification_submitted_at": None,
        "verification_checked_at": None,
        "verification_notes": None,
        "admin_verification_notes": None,
        "documents": [],
    }


def public_verification(driver: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not driver:
        return {
            **default_verification_fields(),
            "required_documents": REQUIRED_DOCUMENTS,
        }

    documents = [
        {
            "id": document.get("id"),
            "document_type": document.get("document_type"),
            "file_name": document.get("file_name"),
            "uploaded_at": document.get("uploaded_at"),
            "status": document.get("status", "pending"),
            "rejection_reason": document.get("rejection_reason"),
        }
        for document in driver.get("documents", [])
    ]

    return {
        "driver_id": driver.get("id"),
        "driver_status": driver.get("status"),
        "verified": driver.get("verified", False),
        "verification_status": driver.get("verification_status", "not_started"),
        "verification_provider": driver.get("verification_provider", "manual"),
        "verification_submitted_at": driver.get("verification_submitted_at"),
        "verification_checked_at": driver.get("verification_checked_at"),
        "verification_notes": driver.get("verification_notes"),
        "documents": documents,
        "required_documents": REQUIRED_DOCUMENTS,
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
    documents = [dict(document) for document in existing]
    timestamp = now_iso()
    for document in incoming:
        documents.append(
            {
                "id": new_id(),
                "document_type": document["document_type"],
                "file_name": document["file_name"],
                "file_url": document.get("file_url"),
                "storage_path": document.get("storage_path"),
                "uploaded_at": timestamp,
                "status": "pending",
                "rejection_reason": None,
            }
        )
    return documents


async def submit_manual_verification(user: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
    driver = await ensure_driver_for_user(user, payload)
    timestamp = now_iso()
    documents = merge_documents(driver.get("documents", []), payload.get("documents", []))
    updates = {
        "verification_provider": "manual",
        "verification_status": "pending",
        "verification_submitted_at": timestamp,
        "verification_notes": payload.get("verification_notes"),
        "documents": documents,
        "updated_at": timestamp,
    }
    updated = await database.update_one("drivers", driver["id"], updates) or driver
    await write_audit_log(
        actor_user_id=user["id"],
        actor_role=user.get("role"),
        action="driver_verification_submitted",
        target_type="driver",
        target_id=driver["id"],
        metadata={"document_count": len(documents)},
    )
    return updated


def _safe_file_name(file_name: str) -> str:
    return "".join(character for character in file_name if character.isalnum() or character in ("-", "_", ".")).strip(".") or "document"


async def save_uploaded_document(
    user: Dict[str, Any],
    document_type: str,
    upload: UploadFile,
) -> Dict[str, Any]:
    driver = await ensure_driver_for_user(user)
    document_id = new_id()
    safe_name = _safe_file_name(upload.filename or "document")
    target_dir = STORAGE_ROOT / user["id"]
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / f"{document_id}_{safe_name}"

    content = await upload.read()
    target_path.write_bytes(content)

    timestamp = now_iso()
    document = {
        "id": document_id,
        "document_type": document_type,
        "file_name": upload.filename or safe_name,
        "storage_path": str(target_path),
        "uploaded_at": timestamp,
        "status": "pending",
        "rejection_reason": None,
    }
    documents = [*driver.get("documents", []), document]
    updated = await database.update_one(
        "drivers",
        driver["id"],
        {
            "documents": documents,
            "verification_provider": "manual",
            "verification_status": "needs_review" if driver.get("verification_status") == "rejected" else driver.get("verification_status", "not_started"),
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
    documents = [dict(document) for document in driver.get("documents", [])]
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

    updates = {
        "verification_status": status,
        "verification_checked_at": timestamp,
        "admin_verification_notes": admin_notes,
        "documents": documents,
        "verified": status == "verified",
        "status": "approved" if status == "verified" else status,
        "updated_at": timestamp,
    }
    updated = await database.update_one("drivers", driver["id"], updates) or driver
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
    return updated
