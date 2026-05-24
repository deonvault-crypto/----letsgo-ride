from typing import Any, Dict, Iterable, Optional

from app.database import database
from app.utils import new_id, now_iso


DEFAULT_PREFERENCES = {
    "trip_updates": True,
    "booking_requests": True,
    "support_replies": True,
    "safety_alerts": True,
    "marketing_messages": False,
}


async def create_app_notification(
    user_id: str,
    notification_type: str,
    title: str,
    body: str,
    data: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    timestamp = now_iso()
    notification = {
        "id": new_id(),
        "user_id": user_id,
        "type": notification_type,
        "title": title,
        "body": body,
        "data": data or {},
        "read": False,
        "created_at": timestamp,
        "updated_at": timestamp,
        "delivered_push": False,
        "push_status": "not_configured",
    }
    return await database.insert_one("app_notifications", notification)


async def notify_users(
    user_ids: Iterable[str],
    notification_type: str,
    title: str,
    body: str,
    data: Optional[Dict[str, Any]] = None,
) -> None:
    seen = set()
    for user_id in user_ids:
        if not user_id or user_id in seen:
            continue
        seen.add(user_id)
        await create_app_notification(user_id, notification_type, title, body, data)


async def notify_admins(notification_type: str, title: str, body: str, data: Optional[Dict[str, Any]] = None) -> None:
    admins = await database.find_many("users", {"role": "admin"})
    await notify_users([admin["id"] for admin in admins], notification_type, title, body, data)


async def get_or_create_preferences(user_id: str) -> Dict[str, Any]:
    existing = await database.find_one("notification_preferences", {"user_id": user_id})
    if existing:
        return existing
    timestamp = now_iso()
    created = {
        "id": new_id(),
        "user_id": user_id,
        **DEFAULT_PREFERENCES,
        "created_at": timestamp,
        "updated_at": timestamp,
    }
    return await database.insert_one("notification_preferences", created)

