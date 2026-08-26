from pathlib import Path
from typing import Any, Dict

from fastapi import UploadFile

from app.config import get_settings
from app.database import database
from app.utils import new_id, now_iso
from app.services.upload_security_service import validate_upload


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
    validated = await validate_upload(upload, max_bytes=4 * 1024 * 1024, allow_pdf=False, stem="profile-photo")
    user_dir = STORAGE_ROOT / user["id"]
    user_dir.mkdir(parents=True, exist_ok=True)
    safe_name = "profile-photo.jpg"
    file_name = f"{new_id()}_{safe_name}"
    target_path = user_dir / file_name

    target_path.write_bytes(validated.data)

    relative_url = f"/media/profile-photos/{user['id']}/{file_name}"
    updates = {
        "profile_photo_url": absolute_profile_photo_url(relative_url),
        "profile_photo_name": upload.filename or safe_name,
        "updated_at": now_iso(),
    }
    updated = await database.update_one("users", user["id"], updates)
    return updated or {**user, **updates}

