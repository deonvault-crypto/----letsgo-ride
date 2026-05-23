from typing import Any, Dict, Optional

from fastapi import Header

from app.services.auth_service import find_user_by_token
from app.utils import api_error


async def get_optional_current_user(
    authorization: str = Header(default=""),
) -> Optional[Dict[str, Any]]:
    token = authorization.replace("Bearer", "").strip()
    if not token:
        return None
    return await find_user_by_token(token)


async def get_current_user(
    authorization: str = Header(default=""),
) -> Dict[str, Any]:
    user = await get_optional_current_user(authorization)
    if not user:
        api_error("Sign in before continuing.", 401)
    return user


async def get_admin_user(
    authorization: str = Header(default=""),
) -> Dict[str, Any]:
    user = await get_current_user(authorization)
    if user.get("role") != "admin":
        api_error("Admin access is required.", 403)
    return user
