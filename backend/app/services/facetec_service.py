from __future__ import annotations

import asyncio
import base64
import json
import logging
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, Optional

from app.config import get_settings
from app.database import database
from app.services.audit_service import write_audit_log
from app.services.notification_service import notify_admins
from app.services.verification_service import ensure_driver_for_user, public_verification
from app.utils import new_id, now_iso


logger = logging.getLogger(__name__)
FACETEC_REVIEW_STORAGE_ROOT = Path(__file__).resolve().parents[2] / "storage" / "facetec_review_packets"
SAFE_EVENT_STATUSES = {"active", "flagged_for_review", "processing_biometrics"}


class FaceTecConfigurationError(RuntimeError):
    pass


class FaceTecProviderError(RuntimeError):
    def __init__(self, message: str, status_code: Optional[int] = None, body: Optional[str] = None) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.body = body


def _configured_server_url() -> str:
    settings = get_settings()
    if not settings.facetec_server_url:
        raise FaceTecConfigurationError("FaceTec server URL is not configured.")
    return settings.facetec_server_url


def _safe_provider_body(body: str) -> str:
    return body[:500].replace("\n", " ").replace("\r", " ")


def _post_json(path: str, payload: Dict[str, Any], headers: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    settings = get_settings()
    url = f"{_configured_server_url()}{path}"
    request_headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "LetsGoRideBackend/1.0",
    }
    if settings.facetec_device_key_identifier:
        request_headers["X-Device-Key"] = settings.facetec_device_key_identifier
    if settings.facetec_server_key_identifier:
        request_headers["X-Server-Key-Identifier"] = settings.facetec_server_key_identifier
    if headers:
        request_headers.update(headers)
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=request_headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read().decode("utf-8")
            return json.loads(body or "{}")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        logger.warning(
            "provider=facetec action=post_json path=%s status_code=%s body=%s",
            path,
            exc.code,
            _safe_provider_body(body),
        )
        raise FaceTecProviderError("FaceTec provider rejected the request.", exc.code, _safe_provider_body(body)) from exc
    except Exception as exc:
        logger.warning("provider=facetec action=post_json path=%s status_code=none error=%s", path, str(exc)[:300])
        raise FaceTecProviderError("FaceTec provider could not be reached.") from exc


def _get_json(path: str, headers: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    settings = get_settings()
    url = f"{_configured_server_url()}{path}"
    request_headers = {
        "Accept": "application/json",
        "User-Agent": "LetsGoRideBackend/1.0",
    }
    if settings.facetec_device_key_identifier:
        request_headers["X-Device-Key"] = settings.facetec_device_key_identifier
    if settings.facetec_server_key_identifier:
        request_headers["X-Server-Key-Identifier"] = settings.facetec_server_key_identifier
    if headers:
        request_headers.update(headers)
    request = urllib.request.Request(url, headers=request_headers, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            body = response.read().decode("utf-8")
            return json.loads(body or "{}")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        logger.warning(
            "provider=facetec action=get_json path=%s status_code=%s body=%s",
            path,
            exc.code,
            _safe_provider_body(body),
        )
        raise FaceTecProviderError("FaceTec provider rejected the request.", exc.code, _safe_provider_body(body)) from exc
    except Exception as exc:
        logger.warning("provider=facetec action=get_json path=%s status_code=none error=%s", path, str(exc)[:300])
        raise FaceTecProviderError("FaceTec provider could not be reached.") from exc


async def create_facetec_session_token(user: Dict[str, Any]) -> Dict[str, Any]:
    settings = get_settings()
    if not settings.facetec_configured:
        raise FaceTecConfigurationError("FaceTec is not configured.")
    await _mark_processing(user)
    response = await asyncio.to_thread(_get_json, "/session-token")
    token = response.get("sessionToken") or response.get("session_token")
    if not token:
        raise FaceTecProviderError("FaceTec session token response was invalid.")
    return {
        "session_token": token,
        "device_key_identifier": settings.facetec_device_key_identifier,
        "external_database_ref_id": f"letsgoride_{user['id']}_{new_id()}",
    }


async def process_facetec_verification(user: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
    settings = get_settings()
    if not settings.facetec_configured:
        raise FaceTecConfigurationError("FaceTec is not configured.")
    driver = await _mark_processing(user)
    min_match_level = payload.get("min_match_level") or settings.facetec_min_match_level
    external_ref = payload.get("external_database_ref_id") or f"letsgoride_{user['id']}_{new_id()}"

    enrollment_response = await asyncio.to_thread(
        _post_json,
        "/enrollment-3d",
        {
            "faceScan": payload["face_scan"],
            "auditTrailImage": payload.get("audit_trail_image"),
            "lowQualityAuditTrailImage": payload.get("low_quality_audit_trail_image"),
            "externalDatabaseRefID": external_ref,
        },
        _facetec_user_agent_headers(payload.get("session_id")),
    )
    if not _was_processed(enrollment_response):
        return await _flag_for_manual_review(user, driver, payload, "Face scan could not be processed.", enrollment_response)

    id_response = await asyncio.to_thread(
        _post_json,
        "/match-3d-2d-idscan",
        {
            "externalDatabaseRefID": external_ref,
            "idScan": payload["id_scan"],
            "idScanFrontImage": payload.get("id_scan_front_image"),
            "idScanBackImage": payload.get("id_scan_back_image"),
            "minMatchLevel": min_match_level,
        },
        _facetec_user_agent_headers(payload.get("session_id")),
    )
    if not _was_processed(id_response):
        return await _flag_for_manual_review(user, driver, payload, "ID scan could not be processed.", id_response)

    decision = _decision_from_provider(
        enrollment_response,
        id_response,
        settings.facetec_high_confidence_threshold,
        min_match_level,
    )
    if decision["approved"]:
        return await _approve_facetec_user(user, driver, external_ref, decision)

    return await _flag_for_manual_review(user, driver, payload, decision["reason"], id_response)


def _facetec_user_agent_headers(session_id: Optional[str]) -> Dict[str, str]:
    if not session_id:
        return {}
    # The native SDK also sends a FaceTec-generated user agent directly to the gateway.
    # The backend forwards only a safe correlation hint, not user secrets.
    return {"X-LetsGoRide-FaceTec-Session": session_id}


def _was_processed(response: Dict[str, Any]) -> bool:
    if response.get("error") is True:
        return False
    return bool(response.get("wasProcessed", response.get("success", False)))


def _decision_from_provider(
    enrollment_response: Dict[str, Any],
    id_response: Dict[str, Any],
    confidence_threshold: float,
    min_match_level: int,
) -> Dict[str, Any]:
    match_level = _first_number(id_response, "matchLevel", "match_level", "faceTecMatchLevel")
    confidence = _first_number(id_response, "matchConfidence", "confidence", "match_confidence")
    liveness = _first_bool(enrollment_response, "isLive", "is_live", "livenessConfirmed", "success") or _first_bool(id_response, "isLive", "is_live", "livenessConfirmed")
    high_confidence = confidence is not None and confidence >= confidence_threshold
    high_match = match_level is not None and match_level >= min_match_level
    has_match_signal = confidence is not None or match_level is not None
    if liveness and has_match_signal and (high_confidence or high_match):
        return {"approved": True, "match_level": match_level, "confidence": confidence, "is_live": liveness}
    return {
        "approved": False,
        "reason": "FaceTec verification needs manual review.",
        "match_level": match_level,
        "confidence": confidence,
        "is_live": liveness,
    }


def _first_number(row: Dict[str, Any], *keys: str) -> Optional[float]:
    for key in keys:
        value = row.get(key)
        if value is None:
            continue
        try:
            return float(value)
        except (TypeError, ValueError):
            continue
    return None


def _first_bool(row: Dict[str, Any], *keys: str) -> bool:
    for key in keys:
        value = row.get(key)
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.strip().lower() in {"true", "yes", "1", "live", "success"}
    return False


async def _mark_processing(user: Dict[str, Any]) -> Dict[str, Any]:
    driver = await ensure_driver_for_user(user)
    timestamp = now_iso()
    updates = {
        "verification_provider": "facetec",
        "verification_status": "processing_biometrics",
        "identity_verification_state": "processing_biometrics",
        "updated_at": timestamp,
    }
    driver = await database.update_one("drivers", driver["id"], updates) or driver
    await database.update_one(
        "users",
        user["id"],
        {
            "verification_status": "processing_biometrics",
            "verification_provider": "facetec",
            "identity_verification_state": "processing_biometrics",
            "updated_at": timestamp,
        },
    )
    return driver


async def _approve_facetec_user(user: Dict[str, Any], driver: Dict[str, Any], external_ref: str, decision: Dict[str, Any]) -> Dict[str, Any]:
    timestamp = now_iso()
    updates = {
        "verification_provider": "facetec",
        "verification_status": "active",
        "identity_verification_state": "active",
        "verified": True,
        "status": "approved",
        "verification_checked_at": timestamp,
        "facetec_external_database_ref_id": external_ref,
        "facetec_decision": _safe_decision(decision),
        "updated_at": timestamp,
    }
    driver = await database.update_one("drivers", driver["id"], updates) or {**driver, **updates}
    await database.update_one(
        "users",
        user["id"],
        {
            "verification_status": "active",
            "verification_provider": "facetec",
            "identity_verification_state": "active",
            "updated_at": timestamp,
        },
    )
    await database.insert_one(
        "verification_events",
        {
            "id": new_id(),
            "user_id": user["id"],
            "driver_id": driver["id"],
            "provider": "facetec",
            "status": "active",
            "created_at": timestamp,
            "decision": _safe_decision(decision),
        },
    )
    await write_audit_log(
        actor_user_id=user["id"],
        actor_role=user.get("role"),
        action="facetec_verification_active",
        target_type="driver",
        target_id=driver["id"],
        metadata=_safe_decision(decision),
    )
    return public_verification(driver)


async def _flag_for_manual_review(
    user: Dict[str, Any],
    driver: Dict[str, Any],
    payload: Dict[str, Any],
    reason: str,
    provider_response: Dict[str, Any],
) -> Dict[str, Any]:
    timestamp = now_iso()
    documents = [*driver.get("documents", []), *_store_review_images(user["id"], payload, timestamp)]
    updates = {
        "verification_provider": "facetec",
        "verification_status": "flagged_for_review",
        "identity_verification_state": "flagged_for_review",
        "verification_submitted_at": driver.get("verification_submitted_at") or timestamp,
        "admin_verification_notes": reason,
        "documents": documents,
        "verified": False,
        "status": "pending_review",
        "facetec_last_provider_response": _safe_provider_decision(provider_response),
        "updated_at": timestamp,
    }
    driver = await database.update_one("drivers", driver["id"], updates) or {**driver, **updates}
    await database.update_one(
        "users",
        user["id"],
        {
            "verification_status": "flagged_for_review",
            "verification_provider": "facetec",
            "identity_verification_state": "flagged_for_review",
            "updated_at": timestamp,
        },
    )
    await database.insert_one(
        "verification_events",
        {
            "id": new_id(),
            "user_id": user["id"],
            "driver_id": driver["id"],
            "provider": "facetec",
            "status": "flagged_for_review",
            "reason": reason,
            "created_at": timestamp,
            "provider_response": _safe_provider_decision(provider_response),
        },
    )
    await notify_admins(
        "driver_verification",
        "FaceTec review needed",
        f"{user.get('name') or 'A driver'} needs manual verification review.",
        {"driver_id": driver["id"], "verification_status": "flagged_for_review"},
    )
    await write_audit_log(
        actor_user_id=user["id"],
        actor_role=user.get("role"),
        action="facetec_verification_flagged_for_review",
        target_type="driver",
        target_id=driver["id"],
        metadata={"reason": reason},
    )
    return public_verification(driver)


def _store_review_images(user_id: str, payload: Dict[str, Any], timestamp: str) -> list[Dict[str, Any]]:
    rows: list[Dict[str, Any]] = []
    image_fields = [
        ("facetec_audit_trail", payload.get("audit_trail_image"), "facetec-audit-trail.jpg"),
        ("facetec_low_quality_audit_trail", payload.get("low_quality_audit_trail_image"), "facetec-low-quality-audit-trail.jpg"),
        ("facetec_id_front", payload.get("id_scan_front_image"), "facetec-id-front.jpg"),
        ("facetec_id_back", payload.get("id_scan_back_image"), "facetec-id-back.jpg"),
    ]
    target_dir = FACETEC_REVIEW_STORAGE_ROOT / user_id
    target_dir.mkdir(parents=True, exist_ok=True)
    for document_type, encoded, file_name in image_fields:
        if not encoded:
            continue
        try:
            binary = _decode_base64_payload(encoded)
        except Exception:
            continue
        document_id = new_id()
        path = target_dir / f"{document_id}_{file_name}"
        path.write_bytes(binary)
        rows.append(
            {
                "id": document_id,
                "document_type": document_type,
                "file_name": file_name,
                "storage_path": str(path),
                "uploaded_at": timestamp,
                "status": "pending",
                "rejection_reason": None,
                "provider": "facetec",
            }
        )
    return rows


def _decode_base64_payload(value: str) -> bytes:
    encoded = value.split(",", 1)[1] if "," in value[:80] else value
    return base64.b64decode(encoded, validate=False)


def _safe_decision(decision: Dict[str, Any]) -> Dict[str, Any]:
    return {key: decision.get(key) for key in ("match_level", "confidence", "is_live", "approved") if key in decision}


def _safe_provider_decision(provider_response: Dict[str, Any]) -> Dict[str, Any]:
    allowed = {
        "wasProcessed",
        "success",
        "error",
        "errorMessage",
        "matchLevel",
        "matchConfidence",
        "isLive",
        "retryLimitExceeded",
    }
    return {key: provider_response.get(key) for key in allowed if key in provider_response}


class FaceTecRateLimiter:
    def __init__(self, limit: int = 6, window_seconds: int = 300) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self.attempts: Dict[str, list[float]] = {}

    def check(self, key: str) -> bool:
        now = time.time()
        rows = [value for value in self.attempts.get(key, []) if now - value < self.window_seconds]
        if len(rows) >= self.limit:
            self.attempts[key] = rows
            return False
        rows.append(now)
        self.attempts[key] = rows
        return True


facetec_rate_limiter = FaceTecRateLimiter()
