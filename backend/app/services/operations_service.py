from __future__ import annotations

from typing import Any, Dict, List

from app.database import database
from app.utils import new_id, now_iso


def _user_id(user: Dict[str, Any]) -> str:
    return str(user.get("id") or "")


def _is_admin(user: Dict[str, Any]) -> bool:
    return user.get("role") == "admin"


async def list_availability(user: Dict[str, Any]) -> List[Dict[str, Any]]:
    items = await database.find_many("work_availability", {"user_id": _user_id(user)})
    return sorted(items, key=lambda item: (str(item.get("date") or ""), str(item.get("start_time") or "")))


async def create_availability(payload: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    if payload["start_time"] >= payload["end_time"]:
        raise ValueError("End time must be later than start time.")
    item = {
        "id": new_id(),
        "user_id": _user_id(user),
        "created_at": now_iso(),
        "updated_at": now_iso(),
        **payload,
    }
    return await database.insert_one("work_availability", item)


async def delete_availability(item_id: str, user: Dict[str, Any]) -> bool:
    item = await database.find_one("work_availability", {"id": item_id})
    if not item:
        raise ValueError("Availability entry not found.")
    if not _is_admin(user) and item.get("user_id") != _user_id(user):
        raise PermissionError("You cannot delete another user's availability.")
    return await database.delete_one("work_availability", item_id)


async def get_courier_profile(user: Dict[str, Any]) -> Dict[str, Any] | None:
    return await database.find_one("courier_profiles", {"user_id": _user_id(user)})


async def create_courier_profile(payload: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    existing = await get_courier_profile(user)
    if existing:
        return existing
    profile = {
        "id": new_id(),
        "user_id": _user_id(user),
        "name": user.get("name"),
        "status": "PENDING_REVIEW",
        "online": False,
        "completed_deliveries": 0,
        "rating": None,
        "created_at": now_iso(),
        "updated_at": now_iso(),
        **payload,
    }
    return await database.insert_one("courier_profiles", profile)


async def set_courier_online(user: Dict[str, Any], online: bool) -> Dict[str, Any]:
    profile = await get_courier_profile(user)
    if not profile:
        raise ValueError("Create your courier profile first.")
    if online and profile.get("status") != "APPROVED":
        raise PermissionError("Courier verification must be approved before going online.")
    updated = await database.update_one(
        "courier_profiles",
        profile["id"],
        {"online": online, "updated_at": now_iso()},
    )
    if not updated:
        raise ValueError("Courier profile not found.")
    return updated


async def approve_courier_profile(profile_id: str, actor: Dict[str, Any]) -> Dict[str, Any]:
    if not _is_admin(actor):
        raise PermissionError("Only an administrator can approve courier profiles.")
    profile = await database.find_one("courier_profiles", {"id": profile_id})
    if not profile:
        raise ValueError("Courier profile not found.")
    updated = await database.update_one(
        "courier_profiles",
        profile_id,
        {"status": "APPROVED", "approved_at": now_iso(), "updated_at": now_iso()},
    )
    if not updated:
        raise ValueError("Courier profile not found.")
    return updated


async def assigned_courier_deliveries(user: Dict[str, Any]) -> List[Dict[str, Any]]:
    deliveries = await database.find_many("courier_deliveries", {"courier_user_id": _user_id(user)})
    return sorted(deliveries, key=lambda item: str(item.get("updated_at") or ""), reverse=True)
