from __future__ import annotations

import logging
from typing import Any, Dict

from app.database import database
from app.models.event import RealtimeAudience
from app.services.event_service import realtime_event_service


logger = logging.getLogger(__name__)


def conversation_realtime_version(conversation: Dict[str, Any]) -> int:
    value = conversation.get("realtime_version", 0)
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else 0


async def insert_versioned_conversation(conversation: Dict[str, Any]) -> Dict[str, Any]:
    return await database.insert_one("conversations", {**conversation, "realtime_version": 1})


async def update_versioned_conversation(
    filters: Dict[str, Any],
    updates: Dict[str, Any],
) -> Dict[str, Any] | None:
    return await database.update_one_atomic(
        "conversations",
        filters,
        updates,
        {"realtime_version": 1},
    )


def _audience(conversation: Dict[str, Any]) -> RealtimeAudience:
    participants = frozenset(
        participant
        for participant in (
            str(conversation.get("driver_user_id") or ""),
            str(conversation.get("passenger_id") or ""),
        )
        if participant
    )
    return RealtimeAudience(user_ids=participants, roles=frozenset({"admin"}))


def _summary_payload(conversation: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "conversation_id": conversation.get("id"),
        "realtime_version": conversation_realtime_version(conversation),
        "status": conversation.get("status"),
        "last_message": conversation.get("last_message"),
        "last_message_at": conversation.get("last_message_at"),
        "last_message_sender_id": conversation.get("last_message_sender_id"),
        "updated_at": conversation.get("updated_at"),
    }


def _safe_message(message: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": message.get("id"),
        "conversation_id": message.get("conversation_id"),
        "sender_id": message.get("sender_id"),
        "body": message.get("body"),
        "created_at": message.get("created_at"),
        "read_by_driver": bool(message.get("read_by_driver")),
        "read_by_passenger": bool(message.get("read_by_passenger")),
        "system": bool(message.get("system")),
    }


async def publish_conversation_realtime(
    conversation: Dict[str, Any],
    event_type: str,
    *,
    message: Dict[str, Any] | None = None,
    reader_user_id: str | None = None,
    read_through_message_id: str | None = None,
) -> bool:
    payload = _summary_payload(conversation)
    if message:
        payload["message"] = _safe_message(message)
    if reader_user_id:
        payload["reader_user_id"] = reader_user_id
        payload["read_through_message_id"] = read_through_message_id
    try:
        published = await realtime_event_service.publish(
            realtime_event_service.build_event(
                event_type=event_type,
                resource_type="conversation",
                resource_id=str(conversation.get("id") or ""),
                version=conversation_realtime_version(conversation),
                audience=_audience(conversation),
                payload=payload,
            )
        )
        if not published:
            logger.warning(
                "conversation_realtime_unavailable conversation_id=%s version=%s",
                conversation.get("id"),
                conversation_realtime_version(conversation),
            )
        return published
    except Exception as exc:
        logger.warning(
            "conversation_realtime_publish_failed conversation_id=%s version=%s error=%s",
            conversation.get("id"),
            conversation_realtime_version(conversation),
            type(exc).__name__,
        )
        return False
