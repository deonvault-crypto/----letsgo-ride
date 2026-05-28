import logging
from typing import Any, Dict, Optional

from app.config import get_settings


logger = logging.getLogger(__name__)


def _result(
    *,
    status: str,
    score: Optional[float] = None,
    reason: Optional[str] = None,
    provider: str = "disabled",
) -> Dict[str, Any]:
    return {
        "face_match_score": score,
        "face_match_status": status,
        "face_match_reason": reason,
        "face_match_provider": provider,
    }


async def compare_selfie_to_identity(
    *,
    selfie_document: Optional[Dict[str, Any]],
    identity_document: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    settings = get_settings()
    if not settings.verification_face_match_enabled:
        return _result(status="not_required", reason="Face matching is disabled.")
    if not selfie_document or not identity_document:
        return _result(
            status="not_available",
            provider=settings.verification_face_match_provider or "disabled",
            reason="Selfie and identity document are required for face matching.",
        )
    if not settings.verification_face_match_provider:
        return _result(
            status="not_available",
            provider="disabled",
            reason="Face matching provider is not configured.",
        )

    logger.warning(
        "verification_intelligence stage=face_provider_unavailable provider=%s selfie_id=%s identity_id=%s",
        settings.verification_face_match_provider,
        selfie_document.get("id"),
        identity_document.get("id"),
    )
    return _result(
        status="not_available",
        provider=settings.verification_face_match_provider,
        reason="Face matching provider is configured but not implemented in this build.",
    )
