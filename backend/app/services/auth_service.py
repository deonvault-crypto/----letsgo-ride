from typing import Any, Dict, Optional

from app.database import database
from app.utils import new_id, now_iso


async def find_user_by_phone(phone: str) -> Optional[Dict[str, Any]]:
    return await database.find_one("users", {"phone": phone})


async def find_user_by_token(token: str) -> Optional[Dict[str, Any]]:
    return await database.find_one("users", {"token": token})


async def create_or_update_user(phone: str, role: str, name: Optional[str] = None) -> Dict[str, Any]:
    existing = await find_user_by_phone(phone)
    token = f"dev_{new_id()}"
    timestamp = now_iso()

    if existing:
        updates = {
            "role": role or existing.get("role", "passenger"),
            "token": token,
            "updated_at": timestamp,
        }
        if name:
            updates["name"] = name
        updated = await database.update_one("users", existing["id"], updates)
        return updated or existing

    user = {
        "id": new_id(),
        "phone": phone,
        "name": name or "LetsGo Rider",
        "city": "Harare",
        "role": role,
        "rating": 4.8,
        "token": token,
        "is_demo": False,
        "created_at": timestamp,
        "updated_at": timestamp,
    }
    return await database.insert_one("users", user)
