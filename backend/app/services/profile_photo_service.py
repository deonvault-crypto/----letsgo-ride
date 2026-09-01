from __future__ import annotations

import asyncio
import io
import logging
from pathlib import Path
from typing import Any, Dict

import cloudinary
import cloudinary.uploader
from fastapi import UploadFile

from app.config import get_settings
from app.database import database
from app.services.notification_service import notify_admins
from app.services.upload_security_service import validate_upload
from app.utils import new_id, now_iso


logger = logging.getLogger(__name__)
STORAGE_ROOT = Path(__file__).resolve().parents[2] / "storage" / "profile_photos"
WORKER_ROLES_REQUIRING_REVIEW = {"driver", "courier"}


class ProfilePhotoUploadError(RuntimeError):
    def __init__(self, message: str, status_code: int = 503) -> None:
        super().__init__(message)
        self.status_code = status_code


def absolute_profile_photo_url(relative_url: str) -> str:
    if relative_url.startswith("http://") or relative_url.startswith("https://"):
        return relative_url
    base_url = getattr(get_settings(), "public_api_base_url", "").rstrip("/")
    return f"{base_url}{relative_url}" if base_url else relative_url


def _cloudinary_configured() -> bool:
    settings = get_settings()
    return bool(
        getattr(settings, "cloudinary_configured", False)
        or (
            getattr(settings, "cloudinary_cloud_name", "")
            and getattr(settings, "cloudinary_api_key", "")
            and getattr(settings, "cloudinary_api_secret", "")
        )
    )


def _configure_cloudinary() -> bool:
    if not _cloudinary_configured():
        return False
    settings = get_settings()
    cloudinary.config(
        cloud_name=settings.cloudinary_cloud_name,
        api_key=settings.cloudinary_api_key,
        api_secret=settings.cloudinary_api_secret,
        secure=True,
    )
    return True


def _upload_profile_photo(file_bytes: bytes, file_name: str, user_id: str) -> Dict[str, Any]:
    if not _configure_cloudinary():
        raise ProfilePhotoUploadError("Durable profile-photo storage is not configured.")
    file_obj = io.BytesIO(file_bytes)
    file_obj.name = file_name
    try:
        result = cloudinary.uploader.upload(
            file_obj,
            resource_type="image",
            type="upload",
            folder=f"letsgoride/profile-photos/{user_id}",
            use_filename=False,
            unique_filename=True,
            overwrite=False,
        )
    except Exception as exc:
        logger.warning("profile_photo_upload provider=cloudinary status=failed error_type=%s", type(exc).__name__)
        raise ProfilePhotoUploadError("Profile photo could not be stored securely. Please try again.") from exc
    if not result.get("secure_url") or not result.get("public_id"):
        raise ProfilePhotoUploadError("Profile photo storage returned an incomplete result. Please try again.")
    return result


def _destroy_profile_photo(public_id: str) -> None:
    if not public_id or not _configure_cloudinary():
        return
    try:
        cloudinary.uploader.destroy(public_id, resource_type="image", type="upload", invalidate=True)
    except Exception as exc:
        logger.warning("profile_photo_cleanup provider=cloudinary status=failed error_type=%s", type(exc).__name__)


async def delete_profile_photo_asset(public_id: str | None) -> None:
    if public_id:
        await asyncio.to_thread(_destroy_profile_photo, public_id)


def _local_development_photo(user_id: str, data: bytes) -> Dict[str, Any]:
    user_dir = STORAGE_ROOT / user_id
    user_dir.mkdir(parents=True, exist_ok=True)
    file_name = f"{new_id()}_profile-photo.jpg"
    (user_dir / file_name).write_bytes(data)
    return {
        "secure_url": absolute_profile_photo_url(f"/media/profile-photos/{user_id}/{file_name}"),
        "public_id": None,
        "resource_type": "image",
        "type": "local-development",
        "version": None,
    }


async def save_profile_photo(user: Dict[str, Any], upload: UploadFile) -> Dict[str, Any]:
    validated = await validate_upload(
        upload,
        max_bytes=4 * 1024 * 1024,
        allow_pdf=False,
        stem="profile-photo",
        max_image_edge=1280,
    )
    settings = get_settings()
    if _cloudinary_configured():
        stored = await asyncio.to_thread(
            _upload_profile_photo,
            validated.data,
            validated.file_name,
            user["id"],
        )
    elif getattr(settings, "is_production", False):
        raise ProfilePhotoUploadError("Durable profile-photo storage is unavailable.")
    else:
        stored = _local_development_photo(user["id"], validated.data)

    absolute_url = str(stored["secure_url"])
    public_id = stored.get("public_id")
    timestamp = now_iso()
    role = str(user.get("role") or "passenger")
    provider_fields = {
        "url": absolute_url,
        "cloudinary_public_id": public_id,
        "resource_type": stored.get("resource_type") or "image",
        "delivery_type": stored.get("type") or "upload",
        "version": stored.get("version"),
    }

    if role in WORKER_ROLES_REQUIRING_REVIEW:
        updates = {
            "profile_photo_pending_url": provider_fields["url"],
            "profile_photo_pending_cloudinary_public_id": provider_fields["cloudinary_public_id"],
            "profile_photo_pending_resource_type": provider_fields["resource_type"],
            "profile_photo_pending_delivery_type": provider_fields["delivery_type"],
            "profile_photo_pending_version": provider_fields["version"],
            "profile_photo_pending_name": upload.filename or validated.file_name,
            "profile_photo_review_status": "pending",
            "profile_photo_rejection_reason": None,
            "profile_photo_submitted_at": timestamp,
            "profile_photo_reviewed_at": None,
            "profile_photo_reviewed_by": None,
            "updated_at": timestamp,
        }
        if user.get("profile_photo_verified") is not True:
            updates["profile_photo_verified"] = False
        try:
            updated = await database.update_one("users", user["id"], updates)
            if not updated:
                raise RuntimeError("User record was not found after profile-photo upload.")
        except Exception as exc:
            await delete_profile_photo_asset(public_id)
            raise ProfilePhotoUploadError(
                "Profile photo was stored but could not be attached to the account. Please try again."
            ) from exc
        try:
            await notify_admins(
                "worker_profile_photo",
                "Worker photo needs review",
                f"{user.get('name') or 'A worker'} submitted a {role.title()} profile photo.",
                {
                    "user_id": user["id"],
                    "worker_role": role,
                    "notification_target": "admin_worker_profile_photo",
                },
            )
        except Exception as exc:
            logger.warning("profile_photo_upload admin_notification=failed error_type=%s", type(exc).__name__)
        return updated

    updates = {
        "profile_photo_url": provider_fields["url"],
        "profile_photo_cloudinary_public_id": provider_fields["cloudinary_public_id"],
        "profile_photo_resource_type": provider_fields["resource_type"],
        "profile_photo_delivery_type": provider_fields["delivery_type"],
        "profile_photo_version": provider_fields["version"],
        "profile_photo_name": upload.filename or validated.file_name,
        "profile_photo_verified": False,
        "profile_photo_review_status": "not_required",
        "updated_at": timestamp,
    }
    old_public_id = user.get("profile_photo_cloudinary_public_id")
    try:
        updated = await database.update_one("users", user["id"], updates)
        if not updated:
            raise RuntimeError("User record was not found after profile-photo upload.")
    except Exception as exc:
        await delete_profile_photo_asset(public_id)
        raise ProfilePhotoUploadError(
            "Profile photo was stored but could not be attached to the account. Please try again."
        ) from exc
    if old_public_id and old_public_id != public_id:
        await delete_profile_photo_asset(str(old_public_id))
    return updated
