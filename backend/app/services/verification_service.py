import asyncio
import io
import logging
import secrets
import string
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Tuple

import cloudinary
import cloudinary.uploader
from fastapi import UploadFile

from app.config import get_settings
from app.database import database
from app.services.email_service import send_driver_verification_status_email
from app.services.verification_face_service import compare_selfie_to_identity
from app.services.verification_ocr_service import EXTRACTABLE_FIELDS, extract_verification_fields
from app.services.notification_service import create_app_notification, notify_admins
from app.services.audit_service import write_audit_log
from app.utils import new_id, now_iso
from app.services.upload_security_service import validate_upload


settings = get_settings()
logger = logging.getLogger(__name__)

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

LOW_RISK_MAX = 0.34
MEDIUM_RISK_MAX = 0.69


class VerificationUploadError(RuntimeError):
    def __init__(
        self,
        stage: str,
        message: str,
        status_code: int = 502,
        error_type: Optional[str] = None,
    ) -> None:
        super().__init__(message)
        self.stage = stage
        self.message = message
        self.error_type = error_type or self.__class__.__name__
        self.status_code = status_code


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
        "ocr_provider": "disabled",
        "ocr_extracted_fields": {},
        "ocr_confidence": 0,
        "ocr_documents": {},
        "face_match_score": None,
        "face_match_status": "not_required",
        "face_match_reason": "Face matching is disabled.",
        "face_match_provider": "disabled",
        "challenge_code": None,
        "challenge_created_at": None,
        "duplicate_flags": [],
        "face_embedding_duplicate_status": "not_implemented",
        "risk_score": 0,
        "risk_level": "low",
        "risk_flags": [],
        "review_reasons": [],
        "auto_approval_eligible": False,
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


def _generate_challenge_code() -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(6))


def _safe_file_name(file_name: str) -> str:
    return "".join(character for character in file_name if character.isalnum() or character in ("-", "_", ".")).strip(".") or "document"


def _configure_cloudinary_sdk():
    config = cloudinary.config(
        cloud_name=settings.cloudinary_cloud_name or None,
        api_key=settings.cloudinary_api_key or None,
        api_secret=settings.cloudinary_api_secret or None,
        secure=True,
    )
    logger.info(
        "verification_upload cloudinary_init source=%s cloudinary_url_present=%s configured=%s cloud_name=%s api_key_present=%s api_secret_present=%s sdk_cloud_name=%s",
        settings.cloudinary_config_source,
        settings.cloudinary_url_present,
        bool(config.cloud_name and config.api_key and config.api_secret),
        settings.cloudinary_cloud_name or "missing",
        bool(settings.cloudinary_api_key),
        bool(settings.cloudinary_api_secret),
        config.cloud_name or "missing",
    )
    return config


cloudinary_config = _configure_cloudinary_sdk()


def cloudinary_configuration_status() -> Dict[str, bool]:
    config = cloudinary.config()
    cloud_name_present = bool(config.cloud_name)
    api_key_present = bool(config.api_key)
    api_secret_present = bool(config.api_secret)
    return {
        "configured": bool(cloud_name_present and api_key_present and api_secret_present),
        "cloud_name_present": cloud_name_present,
        "api_key_present": api_key_present,
        "api_secret_present": api_secret_present,
    }


def _cloudinary_configured() -> bool:
    return cloudinary_configuration_status()["configured"]


def _cloudinary_upload(file_bytes: bytes, filename: str, content_type: Optional[str], document_type: str, resource_type: str) -> Dict[str, Any]:
    config_status = cloudinary_configuration_status()
    logger.info(
        "verification_upload stage=cloudinary_config_detected configured=%s cloud_name_present=%s api_key_present=%s api_secret_present=%s",
        config_status["configured"],
        config_status["cloud_name_present"],
        config_status["api_key_present"],
        config_status["api_secret_present"],
    )
    if not config_status["configured"]:
        raise VerificationUploadError(
            "cloudinary_init",
            "Cloudinary is not configured for verification uploads.",
        )

    folder = f"letsgoride/verification/{document_type}"
    file_obj = io.BytesIO(file_bytes)
    file_obj.name = filename
    logger.info(
        "verification_upload stage=cloudinary_upload_start document_type=%s content_type=%s bytes=%s",
        document_type,
        content_type or "unknown",
        len(file_bytes),
    )
    try:
        result = cloudinary.uploader.upload(
            file_obj,
            resource_type=resource_type,
            type="authenticated",
            folder=folder,
            use_filename=True,
            unique_filename=True,
        )
    except Exception as exc:
        raise VerificationUploadError(
            "cloudinary_upload",
            "Cloudinary upload failed.",
            error_type=type(exc).__name__,
        ) from exc
    logger.info(
        "verification_upload stage=cloudinary_upload_done resource_type=%s secure_reference_present=%s",
        result.get("resource_type"),
        bool(result.get("secure_url")),
    )
    return result


async def _read_upload_bytes(upload: UploadFile, document_type: str) -> bytes:
    logger.info(
        "verification_upload stage=image_read_start document_type=%s content_type=%s",
        document_type,
        upload.content_type or "missing",
    )
    file_bytes = await upload.read()
    logger.info(
        "verification_upload stage=image_read_done document_type=%s bytes=%s",
        document_type,
        len(file_bytes),
    )
    if not file_bytes:
        raise VerificationUploadError("image_read", "Uploaded verification image was empty.", 400)
    return file_bytes


def _latest_document(documents: List[Dict[str, Any]], document_type: str) -> Optional[Dict[str, Any]]:
    for document in reversed(manual_verification_documents(documents)):
        if document.get("document_type") == document_type:
            return document
    return None


def _collect_ocr_documents(documents: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    ocr_documents: Dict[str, Dict[str, Any]] = {}
    for document in manual_verification_documents(documents):
        result = document.get("ocr")
        if isinstance(result, Mapping):
            ocr_documents[str(document.get("document_type"))] = dict(result)
    return ocr_documents


def _collect_ocr_fields(documents: List[Dict[str, Any]]) -> Dict[str, Any]:
    fields: Dict[str, Any] = {}
    for result in _collect_ocr_documents(documents).values():
        extracted = result.get("extracted_fields")
        if not isinstance(extracted, Mapping):
            continue
        for key, value in extracted.items():
            if key in EXTRACTABLE_FIELDS and value not in (None, ""):
                fields[key] = value
    return fields


def _ocr_provider_summary(ocr_documents: Dict[str, Dict[str, Any]]) -> str:
    for result in ocr_documents.values():
        provider = str(result.get("provider") or "")
        if provider and provider not in {"not_required", "disabled"}:
            return provider
    return "disabled"


def _ocr_confidence_summary(ocr_documents: Dict[str, Dict[str, Any]]) -> float:
    confidences = [
        float(result.get("confidence") or 0)
        for result in ocr_documents.values()
        if str(result.get("status") or "") not in {"not_required", "disabled"}
    ]
    if not confidences:
        return 0
    return round(sum(confidences) / len(confidences), 4)


def _normalized_tokens(value: Any) -> set[str]:
    return {
        token
        for token in "".join(character.lower() if character.isalnum() else " " for character in str(value or "")).split()
        if len(token) > 1
    }


def _profile_name_matches_ocr(profile_name: Any, extracted_name: Any) -> bool:
    profile_tokens = _normalized_tokens(profile_name)
    extracted_tokens = _normalized_tokens(extracted_name)
    if not profile_tokens or not extracted_tokens:
        return True
    return bool(profile_tokens & extracted_tokens)


def _parse_date(value: Any) -> Optional[datetime]:
    if not value:
        return None
    text = str(value).strip()
    formats = ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%Y/%m/%d")
    for date_format in formats:
        try:
            return datetime.strptime(text, date_format).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _risk_level(score: float) -> str:
    if score <= LOW_RISK_MAX:
        return "low"
    if score <= MEDIUM_RISK_MAX:
        return "medium"
    return "high"


def _dedupe_flags(flags: List[str]) -> List[str]:
    return list(dict.fromkeys(flag for flag in flags if flag))


async def _detect_duplicate_flags(
    *,
    user: Dict[str, Any],
    driver: Dict[str, Any],
    documents: List[Dict[str, Any]],
    extracted_fields: Dict[str, Any],
) -> List[str]:
    if not settings.verification_duplicate_detection_enabled:
        return []

    flags: List[str] = []
    phone = str(user.get("phone") or driver.get("phone") or "").strip()
    email = str(user.get("email") or driver.get("email") or "").strip().lower()

    users = await database.find_many("users")
    for other in users:
        if other.get("id") == user.get("id"):
            continue
        if phone and str(other.get("phone") or "").strip() == phone:
            flags.append("duplicate_phone")
        if email and str(other.get("email") or "").strip().lower() == email:
            flags.append("duplicate_email")

    drivers = await database.find_many("drivers")
    current_public_ids = {
        document.get("cloudinary_public_id")
        for document in documents
        if document.get("cloudinary_public_id")
    }
    identity_number = str(extracted_fields.get("document_number") or "").strip().lower()
    licence_number = str(extracted_fields.get("licence_number") or "").strip().lower()
    plate_number = str(extracted_fields.get("plate_number") or "").strip().lower()

    for other in drivers:
        if other.get("id") == driver.get("id"):
            continue
        if phone and str(other.get("phone") or "").strip() == phone:
            flags.append("duplicate_phone")
        if email and str(other.get("email") or "").strip().lower() == email:
            flags.append("duplicate_email")
        for other_document in manual_verification_documents(other.get("documents", [])):
            public_id = other_document.get("cloudinary_public_id")
            if public_id and public_id in current_public_ids:
                flags.append("duplicate_cloudinary_public_id")
            other_ocr = other_document.get("ocr")
            if not isinstance(other_ocr, Mapping):
                continue
            other_fields = other_ocr.get("extracted_fields")
            if not isinstance(other_fields, Mapping):
                continue
            if identity_number and str(other_fields.get("document_number") or "").strip().lower() == identity_number:
                flags.append("duplicate_identity_document_number")
            if licence_number and str(other_fields.get("licence_number") or "").strip().lower() == licence_number:
                flags.append("duplicate_driver_licence_number")
            if plate_number and str(other_fields.get("plate_number") or "").strip().lower() == plate_number:
                flags.append("duplicate_vehicle_plate")

    return _dedupe_flags(flags)


def _calculate_risk(
    *,
    user: Dict[str, Any],
    driver: Dict[str, Any],
    documents: List[Dict[str, Any]],
    extracted_fields: Dict[str, Any],
    ocr_confidence: float,
    duplicate_flags: List[str],
    face_result: Dict[str, Any],
) -> Dict[str, Any]:
    if not settings.verification_risk_scoring_enabled:
        return {
            "risk_score": 0,
            "risk_level": "low",
            "risk_flags": [],
            "review_reasons": [],
            "auto_approval_eligible": False,
        }

    score = 0.0
    flags: List[str] = []
    review_reasons: List[str] = []
    documents = manual_verification_documents(documents)

    type_counts: Dict[str, int] = {}
    for document in documents:
        doc_type = document.get("document_type")
        if doc_type:
            type_counts[doc_type] = type_counts.get(doc_type, 0) + 1
        file_name = document.get("file_name", "")
        if "." in file_name:
            extension = file_name.rsplit(".", 1)[-1].lower()
            if extension not in ALLOWED_DOCUMENT_EXTENSIONS:
                flags.append("unsupported_file_type")
                review_reasons.append("One document has an unsupported file type.")
                score += 0.25

    duplicate_document_types = [doc_type for doc_type, count in type_counts.items() if count > 1]
    if duplicate_document_types:
        flags.append("duplicate_document_type")
        review_reasons.append("One or more document types were uploaded more than once.")
        score += min(0.1 * len(duplicate_document_types), 0.2)

    missing_required = sorted(REQUIRED_DOCUMENT_TYPES - _document_types(documents))
    if missing_required:
        flags.append("missing_required_documents")
        review_reasons.append("Required verification documents are still missing.")
        score += 0.35

    expiry_date = _parse_date(extracted_fields.get("expiry_date"))
    if expiry_date and expiry_date < datetime.now(timezone.utc):
        flags.append("expired_document")
        review_reasons.append("An extracted document expiry date appears to be expired.")
        score += 0.35

    if duplicate_flags:
        flags.extend(duplicate_flags)
        review_reasons.append("Possible duplicate account, document, or vehicle information was detected.")
        score += min(0.2 + 0.1 * len(duplicate_flags), 0.45)

    extracted_name = extracted_fields.get("full_name")
    profile_name = user.get("name") or driver.get("name")
    if extracted_name and not _profile_name_matches_ocr(profile_name, extracted_name):
        flags.append("ocr_name_mismatch")
        review_reasons.append("The extracted document name does not clearly match the profile name.")
        score += 0.2

    if settings.verification_ocr_enabled and 0 < ocr_confidence < 0.65:
        flags.append("poor_ocr_confidence")
        review_reasons.append("Document text extraction confidence is low.")
        score += 0.2

    if settings.verification_face_match_enabled and face_result.get("face_match_status") == "fail":
        flags.append("face_mismatch")
        review_reasons.append("Face matching did not pass.")
        score += 0.35

    if normalize_verification_status(driver.get("verification_status"), documents) in {"rejected", "needs_resubmission"}:
        flags.append("previous_rejected_verification")
        review_reasons.append("This verification was previously rejected or requested for resubmission.")
        score += 0.15

    score = round(min(score, 1.0), 4)
    flags = _dedupe_flags(flags)
    return {
        "risk_score": score,
        "risk_level": _risk_level(score),
        "risk_flags": flags,
        "review_reasons": _dedupe_flags(review_reasons),
        "auto_approval_eligible": False,
    }


def _auto_approval_eligible(
    *,
    documents: List[Dict[str, Any]],
    duplicate_flags: List[str],
    risk: Dict[str, Any],
    face_result: Dict[str, Any],
) -> bool:
    if not settings.verification_auto_approval_enabled:
        return False
    if risk.get("risk_level") != "low":
        return False
    if not _has_all_required_documents(documents):
        return False
    if duplicate_flags:
        return False
    if any(flag in risk.get("risk_flags", []) for flag in {"expired_document", "unsupported_file_type"}):
        return False
    if face_result.get("face_match_status") not in {"pass", "not_required"}:
        return False
    if settings.verification_ocr_enabled:
        ocr_confidence = float(risk.get("ocr_confidence") or 0)
        if ocr_confidence and ocr_confidence < 0.75:
            return False
    return True


async def _build_verification_intelligence(
    *,
    user: Dict[str, Any],
    driver: Dict[str, Any],
    documents: List[Dict[str, Any]],
) -> Dict[str, Any]:
    documents = manual_verification_documents(documents)
    ocr_documents = _collect_ocr_documents(documents)
    extracted_fields = _collect_ocr_fields(documents)
    ocr_confidence = _ocr_confidence_summary(ocr_documents)
    try:
        face_result = await compare_selfie_to_identity(
            selfie_document=_latest_document(documents, "selfie"),
            identity_document=_latest_document(documents, "identity_document"),
        )
    except Exception as exc:
        logger.warning(
            "verification_intelligence stage=face_match_failed error_type=%s",
            type(exc).__name__,
        )
        face_result = {
            "face_match_score": None,
            "face_match_status": "not_available",
            "face_match_reason": "Face matching failed and the verification was sent to manual review.",
            "face_match_provider": "disabled",
        }
    try:
        duplicate_flags = await _detect_duplicate_flags(
            user=user,
            driver=driver,
            documents=documents,
            extracted_fields=extracted_fields,
        )
    except Exception as exc:
        logger.warning(
            "verification_intelligence stage=duplicate_detection_failed error_type=%s",
            type(exc).__name__,
        )
        duplicate_flags = ["duplicate_detection_unavailable"]
    risk = _calculate_risk(
        user=user,
        driver=driver,
        documents=documents,
        extracted_fields=extracted_fields,
        ocr_confidence=ocr_confidence,
        duplicate_flags=duplicate_flags,
        face_result=face_result,
    )
    risk["ocr_confidence"] = ocr_confidence
    auto_approval_eligible = _auto_approval_eligible(
        documents=documents,
        duplicate_flags=duplicate_flags,
        risk=risk,
        face_result=face_result,
    )
    review_reasons = list(risk.get("review_reasons", []))
    if not auto_approval_eligible and _has_all_required_documents(documents) and not review_reasons:
        review_reasons.append("Manual review is required before this driver can be approved.")
    return {
        "ocr_provider": _ocr_provider_summary(ocr_documents),
        "ocr_extracted_fields": extracted_fields,
        "ocr_confidence": ocr_confidence,
        "ocr_documents": ocr_documents,
        "face_match_score": face_result.get("face_match_score"),
        "face_match_status": face_result.get("face_match_status"),
        "face_match_reason": face_result.get("face_match_reason"),
        "face_match_provider": face_result.get("face_match_provider"),
        "duplicate_flags": duplicate_flags,
        "face_embedding_duplicate_status": "not_implemented",
        "risk_score": risk["risk_score"],
        "risk_level": risk["risk_level"],
        "risk_flags": risk["risk_flags"],
        "review_reasons": review_reasons,
        "auto_approval_eligible": auto_approval_eligible,
        "verification_risk_score": risk["risk_score"],
        "verification_risk_flags": risk["risk_flags"],
    }


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
        fields = default_verification_fields()
        for key in (
            "ocr_provider",
            "ocr_extracted_fields",
            "ocr_confidence",
            "ocr_documents",
            "face_match_score",
            "face_match_status",
            "face_match_reason",
            "face_match_provider",
            "duplicate_flags",
            "face_embedding_duplicate_status",
            "risk_score",
            "risk_level",
            "risk_flags",
            "review_reasons",
            "auto_approval_eligible",
            "verification_risk_score",
            "verification_risk_flags",
        ):
            fields.pop(key, None)
        return {**fields, "required_documents": REQUIRED_DOCUMENTS}

    status = public_verification_status(driver)
    documents = [
        {
            "id": document.get("id"),
            "document_type": document.get("document_type"),
            "file_name": document.get("file_name"),
            "has_file": bool(
                document.get("cloudinary_public_id")
                or (document.get("legacy_local_document") is True and document.get("storage_path"))
            ),
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
        "challenge_code": driver.get("challenge_code"),
        "challenge_created_at": driver.get("challenge_created_at"),
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


async def get_or_create_liveness_challenge(user: Dict[str, Any]) -> Dict[str, Any]:
    driver = await ensure_driver_for_user(user)
    if driver.get("challenge_code") and driver.get("challenge_created_at"):
        return {
            "challenge_code": driver.get("challenge_code"),
            "challenge_created_at": driver.get("challenge_created_at"),
        }
    timestamp = now_iso()
    challenge = {
        "challenge_code": _generate_challenge_code(),
        "challenge_created_at": timestamp,
    }
    await database.update_one("drivers", driver["id"], {**challenge, "updated_at": timestamp})
    await database.update_one("users", user["id"], {**challenge, "updated_at": timestamp})
    return challenge


def resolve_submission_documents(driver: Dict[str, Any], references: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    persisted = {str(item.get("id") or ""): item for item in manual_verification_documents(driver.get("documents", [])) if item.get("id")}
    seen_ids: set[str] = set()
    seen_types: set[str] = set()
    selected: List[Dict[str, Any]] = []
    for reference in references:
        document_id = str(reference.get("document_id") or "")
        document_type = str(reference.get("document_type") or "")
        if document_id in seen_ids or document_type in seen_types:
            raise ValueError("Submit each verification document once.")
        document = persisted.get(document_id)
        if not document:
            raise ValueError("One or more verification documents were not uploaded by this account.")
        if document.get("document_type") != document_type:
            raise ValueError("A verification document does not match its selected document type.")
        if str(document.get("status") or "").lower() in {"deleted", "revoked"}:
            raise ValueError("A removed verification document cannot be submitted.")
        if not document.get("cloudinary_public_id") or document.get("delivery_type") != "authenticated":
            raise ValueError("Re-upload this document using the secure verification upload before submitting.")
        seen_ids.add(document_id)
        seen_types.add(document_type)
        selected.append(document)
    missing = REQUIRED_DOCUMENT_TYPES - seen_types
    if missing:
        raise ValueError("Upload every required verification document before submitting.")
    return selected


def _next_status_after_upload(driver: Dict[str, Any], documents: List[Dict[str, Any]]) -> str:
    current_status = normalize_verification_status(driver.get("verification_status"), documents)
    if current_status in {"rejected", "needs_resubmission"}:
        return "needs_resubmission"
    return "pending_uploads"


def _status_from_documents(documents: List[Dict[str, Any]]) -> str:
    if _has_all_required_documents(documents):
        return "pending_auto_check"
    return "pending_uploads"


def _status_from_intelligence(documents: List[Dict[str, Any]], intelligence: Dict[str, Any]) -> str:
    if not _has_all_required_documents(documents):
        return "pending_uploads"
    if intelligence.get("auto_approval_eligible"):
        return "approved"
    if intelligence.get("risk_level") in {"medium", "high"}:
        return "needs_review"
    if intelligence.get("duplicate_flags"):
        return "needs_review"
    return "pending_auto_check"


async def submit_manual_verification(user: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
    driver = await ensure_driver_for_user(user, payload)
    timestamp = now_iso()
    documents = resolve_submission_documents(driver, payload.get("documents", []))
    intelligence = await _build_verification_intelligence(user=user, driver=driver, documents=documents)
    verification_status = _status_from_intelligence(documents, intelligence)
    verified = verification_status == "approved"
    updates: Dict[str, Any] = {
        "verification_provider": "manual",
        "verification_status": verification_status,
        **intelligence,
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
    logger.info(
        "verification_upload stage=save_start user_id=%s document_type=%s content_type=%s",
        user.get("id"),
        document_type,
        upload.content_type or "missing",
    )
    driver = await ensure_driver_for_user(user)
    document_id = new_id()
    timestamp = now_iso()
    try:
        validated = await validate_upload(upload, max_bytes=8 * 1024 * 1024, allow_pdf=True, stem=upload.filename or "document")
    except ValueError as exc:
        raise VerificationUploadError("image_read", str(exc), 400) from exc
    safe_name = validated.file_name
    file_bytes = validated.data

    document: Dict[str, Any] = {
        "id": document_id,
        "document_type": document_type,
        "file_name": safe_name,
        "uploaded_at": timestamp,
        "status": "pending",
        "rejection_reason": None,
        "content_type": validated.content_type,
    }

    cloudinary_result = await asyncio.to_thread(
        _cloudinary_upload,
        file_bytes,
        safe_name,
        validated.content_type,
        document_type,
        validated.resource_type,
    )
    if not cloudinary_result.get("secure_url") or not cloudinary_result.get("public_id"):
        raise VerificationUploadError("cloudinary_upload", "Cloudinary upload did not return secure_url and public_id.")
    document["cloudinary_public_id"] = cloudinary_result.get("public_id")
    document["resource_type"] = cloudinary_result.get("resource_type")
    document["delivery_type"] = "authenticated"
    try:
        document["ocr"] = await extract_verification_fields(
            document_type=document_type,
            document=document,
            file_bytes=file_bytes,
        )
    except Exception as exc:
        logger.warning(
            "verification_intelligence stage=ocr_failed user_id=%s document_type=%s error_type=%s",
            user.get("id"),
            document_type,
            type(exc).__name__,
        )
        document["ocr"] = {
            "provider": "disabled",
            "status": "failed",
            "extracted_fields": {},
            "confidence": 0,
            "reason": "OCR extraction failed and the document was sent to manual review.",
        }

    documents = [*manual_verification_documents(driver.get("documents", [])), document]
    verification_status = _next_status_after_upload(driver, documents)
    intelligence = await _build_verification_intelligence(user=user, driver=driver, documents=documents)
    challenge_updates: Dict[str, Any] = {}
    if document_type == "selfie":
        challenge_updates = {
            "challenge_code": driver.get("challenge_code") or _generate_challenge_code(),
            "challenge_created_at": driver.get("challenge_created_at") or timestamp,
        }

    logger.info(
        "verification_upload stage=mongodb_save_start user_id=%s document_type=%s verification_status=%s",
        user.get("id"),
        document_type,
        verification_status,
    )
    try:
        updated = await database.update_one(
            "drivers",
            driver["id"],
            {
                "documents": documents,
                "verification_provider": "manual",
                "verification_status": verification_status,
                **intelligence,
                **challenge_updates,
                "identity_verification_state": "pending_verification",
                "updated_at": timestamp,
            },
        )
        if not updated:
            raise RuntimeError("Driver record was not found after verification document update.")
        await database.update_one(
            "users",
            user["id"],
            {
                "verification_status": verification_status,
                "verification_provider": "manual",
                "identity_verification_state": "pending_verification",
                **challenge_updates,
                "updated_at": timestamp,
            },
        )
    except Exception as exc:
        raise VerificationUploadError(
            "mongodb_save",
            "MongoDB save failed.",
            error_type=type(exc).__name__,
        ) from exc
    logger.info(
        "verification_upload stage=mongodb_save_done document_type=%s secure_reference_present=%s",
        document_type,
        bool(document.get("cloudinary_public_id")),
    )
    try:
        await write_audit_log(
            actor_user_id=user["id"],
            actor_role=user.get("role"),
            action="driver_verification_document_uploaded",
            target_type="driver",
            target_id=driver["id"],
            metadata={"document_id": document_id, "document_type": document_type},
        )
    except Exception:
        logger.warning(
            "verification_upload stage=audit_log_failed document_type=%s",
            document_type,
        )
    uploaded_documents = public_verification(updated)["documents"]
    if not uploaded_documents:
        raise VerificationUploadError("mongodb_save", "MongoDB save did not return the uploaded document.")
    return uploaded_documents[-1]


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
