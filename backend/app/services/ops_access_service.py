from typing import Any, Dict

from fastapi import Depends

from app.auth import get_current_user
from app.database import database
from app.utils import api_error


OPS_ROLE_LEVELS = {
    "cs": 10,
    "manager": 20,
    "admin": 30,
}

# The main database helper intentionally knows only about product collections.
# Ops collections are additive and are created automatically by MongoDB in
# production. Adding them to the in-memory store here keeps unit tests isolated
# without changing the mobile/product database contract.
for _collection in ("ops_staff", "ops_cases", "ops_case_events"):
    database.memory.setdefault(_collection, [])


def public_staff_identity(user: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": user.get("id"),
        "name": user.get("name"),
        "email": user.get("email"),
        "phone": user.get("phone"),
        "product_role": user.get("role"),
        "ops_role": user.get("ops_role"),
        "ops_staff_id": user.get("ops_staff_id"),
    }


async def get_ops_user(user=Depends(get_current_user)) -> Dict[str, Any]:
    # Existing application administrators remain the root LetsGoRide operators.
    # CS/Manager access is stored separately and never mutates the mobile role.
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


def require_ops_level(user: Dict[str, Any], minimum_role: str) -> Dict[str, Any]:
    current = OPS_ROLE_LEVELS.get(str(user.get("ops_role") or ""), 0)
    minimum = OPS_ROLE_LEVELS[minimum_role]
    if current < minimum:
        api_error(f"{minimum_role.title()} access is required.", 403)
    return user


async def get_ops_manager(user=Depends(get_ops_user)) -> Dict[str, Any]:
    return require_ops_level(user, "manager")


async def get_ops_admin(user=Depends(get_ops_user)) -> Dict[str, Any]:
    return require_ops_level(user, "admin")


def can_work_case(user: Dict[str, Any], case_level: str) -> bool:
    return OPS_ROLE_LEVELS.get(str(user.get("ops_role") or ""), 0) >= OPS_ROLE_LEVELS.get(case_level, 999)
