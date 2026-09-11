from __future__ import annotations

import json
import secrets
import time
from pathlib import Path
from typing import Any, Dict

import cloudinary
import cloudinary.utils
import requests

from app.config import get_settings


VERIFICATION_STORAGE_ROOT = (Path(__file__).resolve().parents[2] / "storage" / "verification_documents").resolve()
MAX_PRIVATE_DOCUMENT_BYTES = 9 * 1024 * 1024


class PrivateDocumentService:
    def __init__(self) -> None:
        self._redis = None
        self._memory: dict[str, tuple[float, dict[str, str]]] = {}

    async def issue(self, *, actor_id: str, collection: str, owner_id: str, document_id: str) -> str:
        token = secrets.token_urlsafe(32)
        value = {"actor_id": actor_id, "collection": collection, "owner_id": owner_id, "document_id": document_id}
        settings = get_settings()
        if settings.rate_limit_redis_url:
            try:
                if self._redis is None:
                    from redis.asyncio import Redis
                    self._redis = Redis.from_url(settings.rate_limit_redis_url, decode_responses=True)
                await self._redis.setex(f"lgr:document-ticket:{token}", 60, json.dumps(value))
                return token
            except Exception:
                if settings.is_production:
                    raise RuntimeError("Secure document access is temporarily unavailable.")
        self._memory[token] = (time.monotonic() + 60, value)
        return token

    async def consume(self, token: str) -> Dict[str, str] | None:
        settings = get_settings()
        if settings.rate_limit_redis_url:
            try:
                if self._redis is None:
                    from redis.asyncio import Redis
                    self._redis = Redis.from_url(settings.rate_limit_redis_url, decode_responses=True)
                raw = await self._redis.getdel(f"lgr:document-ticket:{token}")
                return json.loads(raw) if raw else None
            except Exception:
                if settings.is_production:
                    return None
        record = self._memory.pop(token, None)
        return record[1] if record and record[0] >= time.monotonic() else None


def private_provider_document_bytes(document: Dict[str, Any]) -> tuple[bytes, str]:
    """Read only a server-owned authenticated Cloudinary object."""
    public_id = str(document.get("cloudinary_public_id") or "").strip()
    if not public_id or document.get("delivery_type") != "authenticated":
        raise FileNotFoundError("Document file is unavailable.")
    settings = get_settings()
    if not (settings.cloudinary_cloud_name and settings.cloudinary_api_key and settings.cloudinary_api_secret):
        raise RuntimeError("Secure document storage is not configured.")
    cloudinary.config(cloud_name=settings.cloudinary_cloud_name, api_key=settings.cloudinary_api_key, api_secret=settings.cloudinary_api_secret, secure=True)
    provider_url = cloudinary.utils.cloudinary_url(
        public_id,
        secure=True,
        sign_url=True,
        type="authenticated",
        resource_type=document.get("resource_type") or "image",
        format=document.get("format") or None,
        version=document.get("version") or None,
    )[0]
    with requests.get(provider_url, timeout=15, allow_redirects=False, stream=True) as response:
        response.raise_for_status()
        chunks: list[bytes] = []
        size = 0
        for chunk in response.iter_content(64 * 1024):
            if not chunk:
                continue
            size += len(chunk)
            if size > MAX_PRIVATE_DOCUMENT_BYTES:
                raise ValueError("Stored document exceeds the allowed size.")
            chunks.append(chunk)
        return b"".join(chunks), str(document.get("content_type") or response.headers.get("content-type") or "application/octet-stream")


def contained_legacy_document_path(document: Dict[str, Any]) -> Path:
    """Resolve an explicitly migrated legacy path under one fixed root."""
    if document.get("legacy_local_document") is not True:
        raise FileNotFoundError("Document file is unavailable.")
    raw_path = str(document.get("storage_path") or "").strip()
    if not raw_path:
        raise FileNotFoundError("Document file is unavailable.")
    candidate = Path(raw_path)
    if not candidate.is_absolute():
        candidate = VERIFICATION_STORAGE_ROOT / candidate
    resolved = candidate.resolve(strict=True)
    try:
        resolved.relative_to(VERIFICATION_STORAGE_ROOT)
    except ValueError as exc:
        raise FileNotFoundError("Document file is unavailable.") from exc
    if not resolved.is_file():
        raise FileNotFoundError("Document file is unavailable.")
    return resolved


private_document_service = PrivateDocumentService()
