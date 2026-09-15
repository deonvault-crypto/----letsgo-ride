from __future__ import annotations

from typing import Any, Dict, List

from pymongo.errors import DuplicateKeyError

from app.database import database
from app.domain.zimbabwe_operations import SERVICE_AREAS, canonical_service_area, validate_vehicle_type
from app.services.audit_service import write_audit_log
from app.services.work_product_service import approved_work_products
from app.utils import new_id, now_iso


APPLICATION_STATUSES = {"DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED"}
REQUIRED_DOCUMENTS = {
    "courier": {"identity_document", "selfie"},
    "driver": {"identity_document", "selfie", "driver_licence", "vehicle_registration"},
    "merchant": {"identity_document", "business_registration"},
}


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
    rows = await database.find_many(
        "worker_applications",
        {"user_id": _user_id(user)},
        sort=[("updated_at", -1)],
    )
    return [public_application(row) for row in rows]


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
    inferred_area_id = next(
        (
            area_id
            for area_id, name in SERVICE_AREAS.items()
            if legacy_area == name.lower() or legacy_area.startswith(f"{name.lower()} ")
        ),
        "",
    )
    payload["service_area_id"] = str(payload.get("service_area_id") or inferred_area_id)
    payload["service_area"] = canonical_service_area(payload["service_area_id"])
    if product in {"courier", "driver"}:
        legacy_vehicle = str(payload.get("vehicle") or "").lower()
        if product == "driver":
            inferred_vehicle = next(
                (
                    candidate
                    for candidate in ("minibus", "hatchback", "pickup", "suv", "van", "sedan")
                    if candidate in legacy_vehicle
                ),
                "hatchback" if "aqua" in legacy_vehicle else "sedan",
            )
        else:
            inferred_vehicle = next(
                (
                    candidate
                    for candidate in ("motorbike", "bicycle", "scooter", "pickup", "van", "car")
                    if candidate in legacy_vehicle
                ),
                "motorbike",
            )
        payload["vehicle_type"] = validate_vehicle_type(
            product,
            str(payload.get("vehicle_type") or inferred_vehicle),
        )
        details = str(payload.get("vehicle_details") or payload.get("vehicle") or "").strip()
        payload["vehicle_details"] = details or None
        payload["vehicle"] = (
            f"{payload['vehicle_type'].replace('-', ' ').title()} · {details}"
            if details
            else payload["vehicle_type"].replace("-", " ").title()
        )
    if product in {"courier", "driver"} and not str(payload.get("vehicle") or "").strip():
        raise ValueError("Vehicle details are required for this application.")
    if product == "merchant" and not all(
        str(payload.get(key) or "").strip()
        for key in ("business_name", "business_address", "business_registration_number")
    ):
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


async def list_worker_applications_for_admin(
    status: str | None = None,
    product: str | None = None,
) -> List[Dict[str, Any]]:
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
    return [
        public_application(row)
        for row in sorted(
            rows,
            key=lambda item: str(item.get("submitted_at") or item.get("created_at") or ""),
            reverse=True,
        )
    ]
