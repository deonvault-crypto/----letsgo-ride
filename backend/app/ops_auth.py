from typing import Any, Dict

from fastapi import Depends

from app.auth import get_current_user
from app.database import database
from app.utils import api_error


OPS_ROLE_LEVELS = {"cs": 10, "manager": 20, "admin": 30}

# These are independent Operations collections. They are created lazily by
# MongoDB in production; setdefault keeps local/in-memory regression tests safe.
for _collection in ("ops_staff", "ops_cases", "ops_case_events"):
    database.memory.setdefault(_collection, [])


def effective_ops_role(user: Dict[str, Any]) -> str:
    """Return the already-authorized Operations role carried by a dependency user."""
    if user.get("role") == "admin":
        return "admin"
    role = str(user.get("ops_role") or "").strip().lower()
    return role if role in OPS_ROLE_LEVELS else ""


async def get_ops_user(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    # Existing application Admins remain root operators. CS and Manager access
    # never changes the user's mobile/product role; it lives in ops_staff.
    if user.get("role") == "admin":
        return {**user, "ops_role": "admin", "ops_staff_id": None}

    staff = await database.find_one(
        "ops_staff",
        {"user_id": user.get("id"), "enabled": {"$ne": False}},
    )
    role = str((staff or {}).get("role") or "").strip().lower()
    if role not in {"cs", "manager"}:
        api_error("LetsGoRide Operations access is required.", 403)
    return {**user, "ops_role": role, "ops_staff_id": staff.get("id")}


def require_ops_level(user: Dict[str, Any], minimum: str) -> Dict[str, Any]:
    role = effective_ops_role(user)
    if OPS_ROLE_LEVELS.get(role, 0) < OPS_ROLE_LEVELS[minimum]:
        api_error(f"{minimum.title()} Operations access is required.", 403)
    return user


async def get_ops_manager(user: Dict[str, Any] = Depends(get_ops_user)) -> Dict[str, Any]:
    return require_ops_level(user, "manager")


async def get_ops_admin(user: Dict[str, Any] = Depends(get_ops_user)) -> Dict[str, Any]:
    return require_ops_level(user, "admin")


def can_manage_case_level(user: Dict[str, Any], escalation_level: str) -> bool:
    required = OPS_ROLE_LEVELS.get(str(escalation_level or "").lower(), OPS_ROLE_LEVELS["admin"])
    return OPS_ROLE_LEVELS.get(effective_ops_role(user), 0) >= required


def public_staff_identity(user: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": user.get("id"),
        "name": user.get("name"),
        "email": user.get("email"),
        "phone": user.get("phone"),
        "product_role": user.get("role"),
        "ops_role": effective_ops_role(user),
        "ops_staff_id": user.get("ops_staff_id"),
    }
