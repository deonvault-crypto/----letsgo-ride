from typing import Any, Dict

from fastapi import Depends

from app.auth import get_current_user
from app.utils import api_error


OPS_ROLE_LEVELS = {"cs": 10, "manager": 20, "admin": 30}


def effective_ops_role(user: Dict[str, Any]) -> str:
    if user.get("role") == "admin":
        return "admin"
    role = str(user.get("ops_role") or "").strip().lower()
    return role if role in OPS_ROLE_LEVELS else ""


async def get_ops_user(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    role = effective_ops_role(user)
    if not role:
        api_error("LetsGoRide Operations access is required.", 403)
    return {**user, "effective_ops_role": role}


def require_ops_level(user: Dict[str, Any], minimum: str) -> None:
    role = effective_ops_role(user)
    if OPS_ROLE_LEVELS.get(role, 0) < OPS_ROLE_LEVELS[minimum]:
        api_error(f"{minimum.title()} Operations access is required.", 403)


def can_manage_case_level(user: Dict[str, Any], escalation_level: str) -> bool:
    role = effective_ops_role(user)
    required = OPS_ROLE_LEVELS.get(escalation_level, 30)
    return OPS_ROLE_LEVELS.get(role, 0) >= required
