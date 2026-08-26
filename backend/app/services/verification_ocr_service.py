import logging
from typing import Any, Dict, Optional

from app.config import get_settings


logger = logging.getLogger(__name__)

OCR_DOCUMENT_TYPES = {
    "identity_document",
    "driver_license",
    "vehicle_registration_or_logbook",
}

EXTRACTABLE_FIELDS = {
    "full_name",
    "date_of_birth",
    "document_number",
    "expiry_date",
    "licence_number",
    "plate_number",
    "vin_or_chassis_number",
}


def _empty_result(
    *,
    provider: str,
    status: str,
    reason: Optional[str] = None,
) -> Dict[str, Any]:
    return {
        "provider": provider,
        "status": status,
        "extracted_fields": {},
        "confidence": 0,
        "reason": reason,
    }


async def extract_verification_fields(
    *,
    document_type: str,
    document: Dict[str, Any],
    file_bytes: bytes,
) -> Dict[str, Any]:
    settings = get_settings()
    if document_type not in OCR_DOCUMENT_TYPES:
        return _empty_result(provider="not_required", status="not_required")
    if not settings.verification_ocr_enabled:
        return _empty_result(provider="disabled", status="disabled")
    if not settings.verification_ocr_provider:
        return _empty_result(provider="disabled", status="disabled")

    logger.warning(
        "verification_intelligence stage=ocr_provider_unavailable provider=%s document_type=%s bytes=%s",
        settings.verification_ocr_provider,
        document_type,
        len(file_bytes),
    )
    return _empty_result(
        provider=settings.verification_ocr_provider,
        status="not_available",
        reason="OCR provider is configured but not implemented in this build.",
    )
