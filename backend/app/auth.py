from typing import Any, Dict, Optional

from fastapi import Header, Request

from app.services.auth_service import find_user_by_token
from app.utils import api_error


async def get_optional_current_user(
    authorization: str = Header(default=""),
) -> Optional[Dict[str, Any]]:
    token = authorization.replace("Bearer", "").strip()
    if not token:
        return None
    return await find_user_by_token(token)


async def _enforce_worker_photo_for_new_work(request: Optional[Request], user: Dict[str, Any]) -> None:
    if request is None or user.get("profile_photo_verified") is True:
        return

    path = request.url.path.rstrip("/")
    if user.get("role") == "driver" and path == "/hailing/driver/online":
        api_error("An approved Driver profile photo is required before going online for Ride Now.", 403)

    if user.get("role") == "courier" and path == "/operations/courier/online":
        try:
            payload = await request.json()
        except Exception:
            payload = {}
        # Never block an unverified worker from going offline. The requirement
        # applies only when starting a new online work session.
        if payload.get("online") is True:
            api_error("An approved Courier profile photo is required before going online for deliveries.", 403)


async def get_current_user(
    authorization: str = Header(default=""),
    request: Request = None,
) -> Dict[str, Any]:
    user = await get_optional_current_user(authorization)
    if not user:
        api_error("Sign in before continuing.", 401)
    await _enforce_worker_photo_for_new_work(request, user)
    return user


async def get_admin_user(
    authorization: str = Header(default=""),
    request: Request = None,
) -> Dict[str, Any]:
    user = await get_current_user(authorization, request)
    if user.get("role") != "admin":
        api_error("Admin access is required.", 403)
    return user
