import mimetypes
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse

from app.services.profile_photo_service import STORAGE_ROOT
from app.utils import api_error


router = APIRouter(prefix="/media", tags=["media"])


@router.get("/profile-photos/{user_id}/{file_name}")
async def profile_photo(user_id: str, file_name: str):
    safe_user_id = "".join(character for character in user_id if character.isalnum() or character in ("-", "_"))
    safe_file_name = "".join(character for character in file_name if character.isalnum() or character in ("-", "_", ".")).strip(".")
    path = STORAGE_ROOT / safe_user_id / safe_file_name
    resolved_root = STORAGE_ROOT.resolve()
    resolved_path = Path(path).resolve()
    if not str(resolved_path).startswith(str(resolved_root)) or not resolved_path.exists() or not resolved_path.is_file():
        api_error("Profile photo not found.", 404)
    media_type = mimetypes.guess_type(str(resolved_path))[0] or "application/octet-stream"
    return FileResponse(resolved_path, media_type=media_type)

