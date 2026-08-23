from __future__ import annotations

from typing import Any, Dict

from app.database import database
from app.utils import now_iso


TERMINAL_COURIER_STATUSES = {"DELIVERED", "CANCELLED", "FAILED"}
ACTIVE_COURIER_STATUSES = {
    "ASSIGNED",
    "COURIER_TO_PICKUP",
    "PICKED_UP",
    "IN_TRANSIT",
    "ARRIVING",
}


async def set_courier_active_reference(delivery: Dict[str, Any]) -> None:
    courier_user_id = str(delivery.get("courier_user_id") or "")
    if not courier_user_id or delivery.get("status") not in ACTIVE_COURIER_STATUSES:
        return
    profile = await database.find_one("courier_profiles", {"user_id": courier_user_id})
    if profile:
        await database.update_one(
            "courier_profiles",
            profile["id"],
            {"active_delivery_id": delivery.get("id"), "updated_at": now_iso()},
        )


async def clear_courier_active_reference(delivery: Dict[str, Any]) -> None:
    """Clear only a pointer that still references this terminal delivery."""
    courier_user_id = str(delivery.get("courier_user_id") or "")
    delivery_id = str(delivery.get("id") or "")
    if not courier_user_id or not delivery_id:
        return
    profile = await database.find_one("courier_profiles", {"user_id": courier_user_id})
    if profile and profile.get("active_delivery_id") == delivery_id:
        await database.update_one(
            "courier_profiles",
            profile["id"],
            {"active_delivery_id": None, "updated_at": now_iso()},
        )
