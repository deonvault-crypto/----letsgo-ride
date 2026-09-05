from __future__ import annotations

import asyncio
import logging
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from app.database import database
from app.services.profile_photo_service import _upload_profile_photo
from app.utils import now_iso


logger = logging.getLogger(__name__)
LEGACY_PROFILE_PHOTO_HOST = "letsgoride-backend.onrender.com"
LEGACY_PROFILE_PHOTO_PREFIX = f"https://{LEGACY_PROFILE_PHOTO_HOST}/media/profile-photos/"
MAX_LEGACY_PHOTO_BYTES = 4 * 1024 * 1024


def _download_legacy_profile_photo(url: str) -> tuple[bytes, str]:
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != LEGACY_PROFILE_PHOTO_HOST or not parsed.path.startswith("/media/profile-photos/"):
        raise ValueError("Unsupported legacy profile-photo URL.")

    request = Request(url, headers={"User-Agent": "LetsGoRide-Legacy-Media-Migration/1.0"})
    with urlopen(request, timeout=12) as response:
        final_url = urlparse(response.geturl())
        if final_url.scheme != "https" or final_url.hostname != LEGACY_PROFILE_PHOTO_HOST:
            raise ValueError("Legacy media request redirected outside the approved host.")
        content_type = str(response.headers.get("Content-Type") or "").split(";", 1)[0].strip().lower()
        if not content_type.startswith("image/"):
            raise ValueError("Legacy profile-photo response was not an image.")
        data = response.read(MAX_LEGACY_PHOTO_BYTES + 1)
        if not data or len(data) > MAX_LEGACY_PHOTO_BYTES:
            raise ValueError("Legacy profile photo exceeded the migration size limit.")
        return data, content_type


async def migrate_legacy_profile_photos() -> dict[str, int]:
    """Move surviving legacy local profile photos into durable Cloudinary storage.

    The migration is idempotent. A successfully migrated user no longer matches
    the legacy-host query on subsequent startups. Historical/deleted accounts are
    intentionally ignored because production does not need to keep their profile
    photo dependency alive.
    """
    rows = await database.find_many(
        "users",
        {
            "status": {"$ne": "deleted"},
            "profile_photo_url": {"$regex": f"^{LEGACY_PROFILE_PHOTO_PREFIX}"},
        },
        limit=50,
    )
    migrated = 0
    failed = 0
    for user in rows:
        user_id = str(user.get("id") or "").strip()
        url = str(user.get("profile_photo_url") or "").strip()
        if not user_id or not url.startswith(LEGACY_PROFILE_PHOTO_PREFIX):
            continue
        try:
            data, content_type = await asyncio.to_thread(_download_legacy_profile_photo, url)
            extension = content_type.split("/", 1)[1].replace("jpeg", "jpg") or "jpg"
            stored = await asyncio.to_thread(
                _upload_profile_photo,
                data,
                f"legacy-profile-photo.{extension}",
                user_id,
            )
            timestamp = now_iso()
            await database.update_one(
                "users",
                user_id,
                {
                    "profile_photo_url": str(stored["secure_url"]),
                    "profile_photo_cloudinary_public_id": stored.get("public_id"),
                    "profile_photo_resource_type": stored.get("resource_type") or "image",
                    "profile_photo_delivery_type": stored.get("type") or "upload",
                    "profile_photo_version": stored.get("version"),
                    "profile_photo_name": user.get("profile_photo_name") or f"legacy-profile-photo.{extension}",
                    "profile_photo_migrated_from_legacy_url": url,
                    "profile_photo_migrated_at": timestamp,
                    "updated_at": timestamp,
                },
            )
            migrated += 1
        except Exception as exc:
            failed += 1
            logger.warning(
                "legacy_profile_photo_migration status=failed user_id=%s error_type=%s",
                user_id,
                type(exc).__name__,
            )

    logger.info(
        "legacy_profile_photo_migration candidates=%s migrated=%s failed=%s",
        len(rows),
        migrated,
        failed,
    )
    return {"candidates": len(rows), "migrated": migrated, "failed": failed}
