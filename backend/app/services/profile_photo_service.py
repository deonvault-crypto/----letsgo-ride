from pathlib import Path
from typing import Any, Dict

from fastapi import UploadFile

from app.config import get_settings
from app.database import database
from app.services.notification_service import notify_admins
from app.utils import new_id, now_iso
from app.services.upload_security_service import validate_upload


STORAGE_ROOT = Path(__file__).resolve().parents[2] / "storage" / "profile_photos"
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
WORKER_ROLES_REQUIRING_REVIEW = {"driver", "courier"}


def _safe_file_name(file_name: str) -> str:
    stem = "".join(character for character in file_name if character.isalnum() or character in ("-", "_", ".")).strip(".")
    return stem or "profile-photo"


def absolute_profile_photo_url(relative_url: str) -> str:
    if relative_url.startswith("http://") or relative_url.startswith("https://"):
        return relative_url
    base_url = getattr(get_settings(), "public_api_base_url", "").rstrip("/")
    return f"{base_url}{relative_url}" if base_url else relative_url


async def save_profile_photo(user: Dict[str, Any], upload: UploadFile) -> Dict[str, Any]:
    validated = await validate_upload(
        upload,
        max_bytes=4 * 1024 * 1024,
        allow_pdf=False,
        stem="profile-photo",
        max_image_edge=1280,
    )
    user_dir = STORAGE_ROOT / user["id"]
    user_dir.mkdir(parents=True, exist_ok=True)
    safe_name = "profile-photo.jpg"
    file_name = f"{new_id()}_{safe_name}"
    target_path = user_dir / file_name

    target_path.write_bytes(validated.data)

    relative_url = f"/media/profile-photos/{user['id']}/{file_name}"
    absolute_url = absolute_profile_photo_url(relative_url)
    timestamp = now_iso()
    role = str(user.get("role") or "passenger")

    if role in WORKER_ROLES_REQUIRING_REVIEW:
        # Worker photos are identity-adjacent trust assets. Uploading a file never
        # makes it approved. Keep any previously-approved public photo active while
        # the replacement waits for review.
        updates = {
            "profile_photo_pending_url": absolute_url,
            "profile_photo_pending_name": upload.filename or safe_name,
            "profile_photo_review_status": "pending",
            "profile_photo_rejection_reason": None,
            "profile_photo_submitted_at": timestamp,
            "profile_photo_reviewed_at": None,
            "profile_photo_reviewed_by": None,
            "updated_at": timestamp,
        }
        if user.get("profile_photo_verified") is not True:
            updates["profile_photo_verified"] = False

        updated = await database.update_one("users", user["id"], updates) or {**user, **updates}
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
        return updated

    updates = {
        "profile_photo_url": absolute_url,
        "profile_photo_name": upload.filename or safe_name,
        "profile_photo_verified": False,
        "profile_photo_review_status": "not_required",
        "updated_at": timestamp,
    }
    updated = await database.update_one("users", user["id"], updates)
    return updated or {**user, **updates}
