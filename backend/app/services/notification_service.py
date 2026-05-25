import asyncio
import json
import logging
import re
from urllib import error, request
from typing import Any, Dict, Iterable, Optional

from app.database import database
from app.utils import new_id, now_iso


logger = logging.getLogger(__name__)
EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send"

DEFAULT_PREFERENCES = {
    "trip_updates": True,
    "booking_requests": True,
    "messages": True,
    "verification_updates": True,
    "support_replies": True,
    "safety_alerts": True,
    "marketing_messages": False,
}

PREFERENCE_FOR_TYPE = {
    "booking_request": "booking_requests",
    "booking_confirmed": "booking_requests",
    "booking_declined": "booking_requests",
    "booking_cancelled": "booking_requests",
    "message": "messages",
    "driver_verification": "verification_updates",
    "support_message": "support_replies",
    "support_reply": "support_replies",
    "safety_report": "safety_alerts",
    "safety_report_updated": "safety_alerts",
    "admin_booking_update": "safety_alerts",
    "ride_departure": "trip_updates",
}


def _safe_provider_body(raw_body: str) -> str:
    body = raw_body.replace("\r", " ").replace("\n", " ").strip()
    body = re.sub(r"ExpoPushToken\[[^\]]+\]", "ExpoPushToken[redacted]", body)
    return body[:500]


def _push_allowed(notification_type: str, preferences: Dict[str, Any]) -> bool:
    preference_key = PREFERENCE_FOR_TYPE.get(notification_type, "trip_updates")
    if preference_key == "safety_alerts":
        return bool(preferences.get(preference_key, True))
    return bool(preferences.get(preference_key, DEFAULT_PREFERENCES.get(preference_key, True)))


def _send_expo_push_batch(payloads: list[Dict[str, Any]]) -> Dict[str, Any]:
    data = json.dumps(payloads).encode("utf-8")
    req = request.Request(
        EXPO_PUSH_ENDPOINT,
        data=data,
        method="POST",
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "LetsGoRideBackend/1.0",
        },
    )
    try:
        with request.urlopen(req, timeout=10) as response:
            body = _safe_provider_body(response.read().decode("utf-8", errors="replace"))
            return {"ok": 200 <= response.status < 300, "status_code": response.status, "body": body}
    except error.HTTPError as exc:
        body = _safe_provider_body(exc.read().decode("utf-8", errors="replace"))
        return {"ok": False, "status_code": exc.code, "body": body}
    except Exception as exc:
        return {"ok": False, "status_code": None, "body": _safe_provider_body(str(exc))}


async def _send_push_for_notification(notification: Dict[str, Any]) -> Dict[str, Any]:
    user_id = notification.get("user_id")
    notification_type = notification.get("type", "trip_updates")
    if not user_id:
        return {"delivered_push": False, "push_status": "missing_user"}

    preferences = await get_or_create_preferences(user_id)
    if not _push_allowed(notification_type, preferences):
        return {"delivered_push": False, "push_status": "disabled_by_preference"}

    tokens = [
        token
        for token in await database.find_many("device_push_tokens", {"user_id": user_id, "active": True})
        if token.get("expo_push_token")
    ]
    if not tokens:
        return {"delivered_push": False, "push_status": "no_active_tokens"}

    payloads = [
        {
            "to": token["expo_push_token"],
            "title": notification.get("title"),
            "body": notification.get("body"),
            "data": notification.get("data", {}),
            "sound": "default",
            "priority": "default",
        }
        for token in tokens
    ]
    result = await asyncio.to_thread(_send_expo_push_batch, payloads)
    provider_body = result.get("body", "")
    delivered = bool(result.get("ok"))
    push_status = f"expo_{result.get('status_code') or 'error'}"

    if "DeviceNotRegistered" in provider_body or "InvalidCredentials" in provider_body:
        for token in tokens:
            await database.update_one(
                "device_push_tokens",
                token["id"],
                {"active": False, "updated_at": now_iso(), "last_provider_error": "invalid_token"},
            )
        push_status = "invalid_token"

    logger.info(
        "notification_push provider=expo notification_type=%s user_id=%s token_count=%s push_sent=%s provider_status=%s body=%s",
        notification_type,
        user_id,
        len(tokens),
        delivered,
        push_status,
        provider_body,
    )
    return {"delivered_push": delivered, "push_status": push_status}


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
    created = await database.insert_one("app_notifications", notification)
    try:
        push_result = await _send_push_for_notification(created)
        updated = await database.update_one(
            "app_notifications",
            created["id"],
            {
                "delivered_push": push_result["delivered_push"],
                "push_status": push_result["push_status"],
                "updated_at": now_iso(),
            },
        )
        return updated or {**created, **push_result}
    except Exception as exc:
        logger.warning(
            "notification_push provider=expo notification_type=%s user_id=%s push_sent=false provider_status=error body=%s",
            notification_type,
            user_id,
            _safe_provider_body(str(exc)),
        )
        await database.update_one(
            "app_notifications",
            created["id"],
            {"delivered_push": False, "push_status": "push_error", "updated_at": now_iso()},
        )
        return created


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
