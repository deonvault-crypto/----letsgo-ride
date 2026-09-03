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
GENERAL_CHANNEL_ID = "general_v1"
RIDE_REQUEST_CHANNEL_ID = "ride_requests_v1"
COURIER_REQUEST_CHANNEL_ID = "courier_requests_v1"
GENERAL_SOUND = "letsgoride_notification.wav"
RIDE_REQUEST_SOUND = "letsgoride_ride_request.wav"
COURIER_REQUEST_SOUND = "letsgoride_courier_request.wav"

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
    "marketing": "marketing_messages",
    "service_update": "trip_updates",
    "safety_alert": "safety_alerts",
    "app_update": "trip_updates",
    "booking_request": "booking_requests",
    "booking_confirmed": "booking_requests",
    "booking_declined": "booking_requests",
    "booking_cancelled": "booking_requests",
    "message": "messages",
    "driver_verification": "verification_updates",
    "worker_profile_photo": "verification_updates",
    "profile_photo_review": "verification_updates",
    "support_message": "support_replies",
    "support_reply": "support_replies",
    "safety_report": "safety_alerts",
    "safety_report_updated": "safety_alerts",
    "admin_booking_update": "safety_alerts",
    "trip_updates": "trip_updates",
    "ride_departure": "trip_updates",
    "trip_review": "trip_updates",
}


def _safe_provider_body(raw_body: str) -> str:
    body = str(raw_body).replace("\r", " ").replace("\n", " ").strip()
    body = re.sub(r"ExpoPushToken\[[^\]]+\]", "ExpoPushToken[redacted]", body)
    return body[:500]


def _push_allowed(notification_type: str, preferences: Dict[str, Any]) -> bool:
    preference_key = PREFERENCE_FOR_TYPE.get(notification_type, "trip_updates")
    if preference_key == "marketing_messages":
        return preferences.get("marketing_messages") is True and preferences.get("marketing_consent_version") == 1
    if preference_key == "safety_alerts":
        return bool(preferences.get(preference_key, True))
    return bool(preferences.get(preference_key, DEFAULT_PREFERENCES.get(preference_key, True)))


def _push_delivery_profile(notification: Dict[str, Any]) -> Dict[str, str]:
    data = notification.get("data") if isinstance(notification.get("data"), dict) else {}
    target = str(data.get("notification_target") or "")
    if target == "hailing_driver_offer":
        return {"channel_id": RIDE_REQUEST_CHANNEL_ID, "sound": RIDE_REQUEST_SOUND}
    if target in {"courier_offer", "courier_delivery_offer"}:
        return {"channel_id": COURIER_REQUEST_CHANNEL_ID, "sound": COURIER_REQUEST_SOUND}
    return {"channel_id": GENERAL_CHANNEL_ID, "sound": GENERAL_SOUND}


def _extract_expo_token(token_doc: Dict[str, Any]) -> Optional[str]:
    token_value = (
        token_doc.get("expo_push_token")
        or token_doc.get("push_token")
        or token_doc.get("token")
    )
    if not token_value:
        return None

    token_value = str(token_value).strip()
    if not token_value:
        return None

    return token_value


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
            raw_body = response.read().decode("utf-8", errors="replace")
            parsed_body = _parse_provider_json(raw_body)
            body = _safe_provider_body(raw_body)
            return {
                "ok": 200 <= response.status < 300,
                "status_code": response.status,
                "body": body,
                "json": parsed_body,
            }
    except error.HTTPError as exc:
        raw_body = exc.read().decode("utf-8", errors="replace")
        parsed_body = _parse_provider_json(raw_body)
        body = _safe_provider_body(raw_body)
        return {"ok": False, "status_code": exc.code, "body": body, "json": parsed_body}
    except Exception as exc:
        return {"ok": False, "status_code": None, "body": _safe_provider_body(str(exc)), "json": None}


def _parse_provider_json(raw_body: str) -> Optional[Dict[str, Any]]:
    try:
        parsed = json.loads(raw_body)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _expo_tickets_from_result(result: Dict[str, Any]) -> list[Dict[str, Any]]:
    parsed = result.get("json")
    if not isinstance(parsed, dict):
        return []

    data = parsed.get("data")
    if isinstance(data, list):
        return [ticket for ticket in data if isinstance(ticket, dict)]
    if isinstance(data, dict):
        return [data]
    return []


def _expo_ticket_error_code(ticket: Dict[str, Any]) -> str:
    details = ticket.get("details")
    if isinstance(details, dict) and details.get("error"):
        return str(details["error"])
    if ticket.get("message"):
        return str(ticket["message"])
    return "unknown_error"


def _expo_ticket_message(ticket: Dict[str, Any]) -> str:
    message = ticket.get("message")
    if message:
        return _safe_provider_body(str(message))
    return _safe_provider_body(json.dumps(ticket, sort_keys=True))


async def _send_push_for_notification(notification: Dict[str, Any]) -> Dict[str, Any]:
    notification_id = notification.get("id")
    user_id = notification.get("user_id")
    notification_type = notification.get("type", "trip_updates")

    if not user_id:
        logger.info(
            "notification_push_check notification_id=%s notification_type=%s user_id=%s push_status=missing_user",
            notification_id,
            notification_type,
            user_id,
        )
        return {"delivered_push": False, "push_status": "missing_user"}

    preferences = await get_or_create_preferences(user_id)
    preference_allowed = _push_allowed(notification_type, preferences)

    if not preference_allowed:
        logger.info(
            "notification_push_check notification_id=%s notification_type=%s user_id=%s preference_allowed=false push_status=disabled_by_preference",
            notification_id,
            notification_type,
            user_id,
        )
        return {"delivered_push": False, "push_status": "disabled_by_preference"}

    token_docs = await database.find_many("device_push_tokens", {"user_id": user_id, "active": True})

    tokens = []
    for token_doc in token_docs:
        expo_token = _extract_expo_token(token_doc)
        if expo_token:
            tokens.append({**token_doc, "expo_push_token": expo_token})

    logger.info(
        "notification_push_check notification_id=%s notification_type=%s user_id=%s preference_allowed=%s token_docs=%s token_count=%s",
        notification_id,
        notification_type,
        user_id,
        preference_allowed,
        len(token_docs),
        len(tokens),
    )

    if not tokens:
        logger.info(
            "notification_push provider=expo notification_id=%s notification_type=%s user_id=%s token_count=0 push_sent=false provider_status=no_active_tokens body=",
            notification_id,
            notification_type,
            user_id,
        )
        return {"delivered_push": False, "push_status": "no_active_tokens"}

    push_profile = _push_delivery_profile(notification)
    payloads = [
        {
            "to": token["expo_push_token"],
            "title": notification.get("title") or "LetsGoRide",
            "body": notification.get("body") or "You have a new update.",
            "data": notification.get("data", {}),
            "sound": push_profile["sound"],
            "priority": "normal" if notification_type == "marketing" else "high",
            "channelId": push_profile["channel_id"],
        }
        for token in tokens
    ]

    result = await asyncio.to_thread(_send_expo_push_batch, payloads)
    provider_body = result.get("body", "")
    status_code = result.get("status_code")
    push_status = f"expo_http_{status_code or 'error'}"

    if not result.get("ok"):
        logger.warning(
            "notification_push provider=expo notification_id=%s notification_type=%s user_id=%s token_count=%s push_sent=false provider_status=%s body=%s",
            notification_id,
            notification_type,
            user_id,
            len(tokens),
            push_status,
            provider_body,
        )
        return {"delivered_push": False, "push_status": push_status}

    tickets = _expo_tickets_from_result(result)
    if not tickets:
        logger.warning(
            "notification_push provider=expo notification_id=%s notification_type=%s user_id=%s token_count=%s push_sent=false provider_status=expo_unparsed_response body=%s",
            notification_id,
            notification_type,
            user_id,
            len(tokens),
            provider_body,
        )
        return {"delivered_push": False, "push_status": "expo_unparsed_response"}

    if len(tickets) != len(tokens):
        logger.warning(
            "notification_push_ticket event=expo_ticket_count_mismatch notification_id=%s notification_type=%s user_id=%s token_count=%s ticket_count=%s",
            notification_id,
            notification_type,
            user_id,
            len(tokens),
            len(tickets),
        )

    success_count = 0
    error_count = 0
    attempted_at = now_iso()

    for index, token in enumerate(tokens):
        ticket = tickets[index] if index < len(tickets) else {
            "status": "error",
            "message": "Expo response did not include a ticket for this token.",
        }
        ticket_status = str(ticket.get("status") or "").lower()
        token_id = token.get("id") or token.get("_id")

        if ticket_status == "ok":
            success_count += 1
            logger.info(
                "notification_push_ticket event=expo_ticket_success notification_id=%s notification_type=%s user_id=%s token_id=%s ticket_id=%s",
                notification_id,
                notification_type,
                user_id,
                token_id,
                ticket.get("id"),
            )
            if token.get("id"):
                await database.update_one(
                    "device_push_tokens",
                    token["id"],
                    {
                        "updated_at": now_iso(),
                        "last_push_attempt_at": attempted_at,
                        "last_push_success_at": now_iso(),
                        "last_provider_error": None,
                        "last_provider_message": None,
                    },
                )
            continue

        error_count += 1
        error_code = _expo_ticket_error_code(ticket)
        error_message = _expo_ticket_message(ticket)
        logger.warning(
            "notification_push_ticket event=expo_ticket_error notification_id=%s notification_type=%s user_id=%s token_id=%s error=%s message=%s",
            notification_id,
            notification_type,
            user_id,
            token_id,
            error_code,
            error_message,
        )

        if token.get("id"):
            update = {
                "updated_at": now_iso(),
                "last_push_attempt_at": attempted_at,
                "last_provider_error": error_code,
                "last_provider_message": error_message,
            }
            if error_code == "DeviceNotRegistered":
                update["active"] = False
            await database.update_one("device_push_tokens", token["id"], update)

    delivered = success_count > 0
    if success_count == len(tokens) and error_count == 0:
        push_status = "expo_ticket_success"
    elif delivered:
        push_status = "expo_partial_failure"
    else:
        push_status = "expo_ticket_error"

    logger.info(
        "notification_push provider=expo notification_id=%s notification_type=%s user_id=%s token_count=%s ticket_success=%s ticket_error=%s push_sent=%s provider_status=%s body=%s",
        notification_id,
        notification_type,
        user_id,
        len(tokens),
        success_count,
        error_count,
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

    logger.info(
        "notification_create notification_id=%s notification_type=%s user_id=%s title=%s",
        notification["id"],
        notification_type,
        user_id,
        title,
    )

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
            {
                "delivered_push": False,
                "push_status": "push_error",
                "updated_at": now_iso(),
            },
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


async def notify_admins(
    notification_type: str,
    title: str,
    body: str,
    data: Optional[Dict[str, Any]] = None,
) -> None:
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
