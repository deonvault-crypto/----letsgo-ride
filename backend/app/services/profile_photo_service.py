from pathlib import Path
from typing import Any, Dict

from fastapi import UploadFile

from app.config import get_settings
from app.database import database
from app.utils import new_id, now_iso


STORAGE_ROOT = Path(__file__).resolve().parents[2] / "storage" / "profile_photos"
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}


def _safe_file_name(file_name: str) -> str:
    stem = "".join(character for character in file_name if character.isalnum() or character in ("-", "_", ".")).strip(".")
    return stem or "profile-photo"


def absolute_profile_photo_url(relative_url: str) -> str:
    if relative_url.startswith("http://") or relative_url.startswith("https://"):
        return relative_url
    base_url = getattr(get_settings(), "public_api_base_url", "").rstrip("/")
    return f"{base_url}{relative_url}" if base_url else relative_url


async def save_profile_photo(user: Dict[str, Any], upload: UploadFile) -> Dict[str, Any]:
    content_type = upload.content_type or ""
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise ValueError("Upload a JPG, PNG, or WebP profile photo.")

    extension = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
    }[content_type]
    user_dir = STORAGE_ROOT / user["id"]
    user_dir.mkdir(parents=True, exist_ok=True)
    safe_name = _safe_file_name(upload.filename or f"profile-photo{extension}")
    if "." not in safe_name:
        safe_name = f"{safe_name}{extension}"
    file_name = f"{new_id()}_{safe_name}"
    target_path = user_dir / file_name

    content = await upload.read()
    if len(content) > 4 * 1024 * 1024:
        raise ValueError("Profile photo must be smaller than 4 MB.")
    target_path.write_bytes(content)

    relative_url = f"/media/profile-photos/{user['id']}/{file_name}"
    updates = {
        "profile_photo_url": absolute_profile_photo_url(relative_url),
        "profile_photo_name": upload.filename or safe_name,
        "updated_at": now_iso(),
    }
    updated = await database.update_one("users", user["id"], updates)
    return updated or {**user, **updates}

