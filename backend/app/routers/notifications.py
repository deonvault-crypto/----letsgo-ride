from typing import Literal, Optional

from pydantic import BaseModel
from fastapi import APIRouter, Depends, Query

from app.auth import get_current_user
from app.database import database
from app.services.notification_service import DEFAULT_PREFERENCES, get_or_create_preferences
from app.utils import api_error, api_success, new_id, now_iso


router = APIRouter(prefix="/notifications", tags=["notifications"])


class PushTokenBody(BaseModel):
    expo_push_token: str
    platform: str
    device_name: Optional[str] = None
    app_version: Optional[str] = None


class NotificationPreferencesBody(BaseModel):
    trip_updates: Optional[bool] = None
    booking_requests: Optional[bool] = None
    messages: Optional[bool] = None
    verification_updates: Optional[bool] = None
    support_replies: Optional[bool] = None
    safety_alerts: Optional[bool] = None
    marketing_messages: Optional[bool] = None
    marketing_consent_version: Optional[Literal[1]] = None


@router.post("/register-token")
async def register_token(payload: PushTokenBody, user=Depends(get_current_user)):
    await database.update_many("device_push_tokens", {"expo_push_token": payload.expo_push_token, "user_id": {"$ne": user["id"]}}, {"active": False, "updated_at": now_iso()})
    existing = await database.find_one("device_push_tokens", {"user_id": user["id"], "expo_push_token": payload.expo_push_token})
    timestamp = now_iso()
    data = {
        "platform": payload.platform,
        "device_name": payload.device_name,
        "app_version": payload.app_version,
        "active": True,
        "last_seen_at": timestamp,
        "updated_at": timestamp,
    }
    if existing:
        return api_success(await database.update_one("device_push_tokens", existing["id"], data))
    created = {
        "id": new_id(),
        "user_id": user["id"],
        "expo_push_token": payload.expo_push_token,
        "created_at": timestamp,
        **data,
    }
    return api_success(await database.insert_one("device_push_tokens", created))


@router.delete("/unregister-token")
async def unregister_token(payload: PushTokenBody, user=Depends(get_current_user)):
    existing = await database.find_one("device_push_tokens", {"user_id": user["id"], "expo_push_token": payload.expo_push_token})
    if not existing:
        return api_success({"active": False})
    return api_success(await database.update_one("device_push_tokens", existing["id"], {"active": False, "updated_at": now_iso()}))


@router.get("")
async def list_notifications(
    limit: int = Query(default=100, ge=1, le=100),
    user=Depends(get_current_user),
):
    notifications = await database.find_many(
        "app_notifications",
        {"user_id": user["id"], "$or": [{"expires_at": {"$exists": False}}, {"expires_at": {"$gt": now_iso()}}]},
        sort=[("created_at", -1)],
        limit=limit,
    )
    stamp = now_iso()
    return api_success([item for item in notifications if not item.get("expires_at") or item["expires_at"] > stamp])


@router.post("/read-all")
async def mark_all_read(user=Depends(get_current_user)):
    await database.update_many(
        "app_notifications",
        {"user_id": user["id"], "read": {"$ne": True}},
        {"read": True, "updated_at": now_iso()},
    )
    return api_success({"read": True})


@router.post("/{notification_id}/read")
async def mark_notification_read(notification_id: str, user=Depends(get_current_user)):
    notification = await database.find_one("app_notifications", {"id": notification_id})
    if not notification or notification.get("user_id") != user["id"]:
        api_error("Notification not found.", 404)
    return api_success(await database.update_one("app_notifications", notification_id, {"read": True, "updated_at": now_iso()}))


@router.get("/preferences")
async def get_preferences(user=Depends(get_current_user)):
    prefs = await get_or_create_preferences(user["id"])
    from app.services.communications_service import marketing_allowed
    return api_success({**{key: prefs.get(key, value) for key, value in DEFAULT_PREFERENCES.items()}, "marketing_messages": marketing_allowed(prefs)})


@router.put("/preferences")
async def update_preferences(payload: NotificationPreferencesBody, user=Depends(get_current_user)):
    prefs = await get_or_create_preferences(user["id"])
    updates = {key: value for key, value in payload.model_dump().items() if value is not None}
    if payload.marketing_messages is not None:
        updates["marketing_consent_updated_at"] = now_iso()
    if payload.marketing_messages is not True:
        updates.pop("marketing_consent_version", None)
    updates["updated_at"] = now_iso()
    updated = await database.update_one("notification_preferences", prefs["id"], updates)
    from app.services.communications_service import marketing_allowed
    return api_success({**{key: (updated or prefs).get(key, value) for key, value in DEFAULT_PREFERENCES.items()}, "marketing_messages": marketing_allowed(updated or prefs)})



@router.get("/{notification_id}")
async def notification_detail(notification_id: str, user=Depends(get_current_user)):
    item = await database.find_one("app_notifications", {"id": notification_id, "user_id": user["id"]})
    if not item:
        api_error("Notification not found.", 404)
    expired = bool(item.get("expires_at") and item["expires_at"] <= now_iso())
    return api_success({**item, "expired": expired, "data": {**item.get("data", {}), "action": "none"} if expired else item.get("data", {})})
