from __future__ import annotations

import asyncio
from typing import Any, Dict, List

from app.database import database
from app.services.conversation_realtime_service import (
    conversation_realtime_version,
    publish_conversation_realtime,
    update_versioned_conversation,
)
from app.services.conversation_service import enrich_conversation
from app.utils import api_error, now_iso


CONVERSATION_HISTORY_LIMIT = 100


async def list_conversations_for_user_scaled(user: Dict[str, Any]) -> List[Dict[str, Any]]:
    user_id = str(user.get("id") or "")
    if user.get("role") == "admin":
        conversations = await database.find_many(
            "conversations",
            {},
            sort=[("updated_at", -1)],
            limit=CONVERSATION_HISTORY_LIMIT,
        )
    else:
        driver_rows, passenger_rows = await asyncio.gather(
            database.find_many(
                "conversations",
                {"driver_user_id": user_id},
                sort=[("updated_at", -1)],
                limit=CONVERSATION_HISTORY_LIMIT,
            ),
            database.find_many(
                "conversations",
                {"passenger_id": user_id},
                sort=[("updated_at", -1)],
                limit=CONVERSATION_HISTORY_LIMIT,
            ),
        )
        by_id = {
            str(item.get("id")): item
            for item in [*driver_rows, *passenger_rows]
            if item.get("id")
        }
        conversations = sorted(
            by_id.values(),
            key=lambda item: str(item.get("updated_at") or item.get("created_at") or ""),
            reverse=True,
        )[:CONVERSATION_HISTORY_LIMIT]

    if not conversations:
        return []
    return list(await asyncio.gather(*(enrich_conversation(item, user) for item in conversations)))


async def mark_conversation_read_scaled(
    conversation: Dict[str, Any],
    user: Dict[str, Any],
) -> Dict[str, Any]:
    """Mark unread messages in one indexed bulk operation."""
    user_id = str(user.get("id") or "")
    if user_id == conversation.get("driver_user_id"):
        read_field = "read_by_driver"
    elif user_id == conversation.get("passenger_id"):
        read_field = "read_by_passenger"
    else:
        return {
            "read": True,
            "changed": 0,
            "conversation_realtime_version": conversation_realtime_version(conversation),
            "read_through_message_id": None,
        }

    filters = {
        "conversation_id": conversation["id"],
        "sender_id": {"$ne": user_id},
        read_field: {"$ne": True},
    }
    latest = await database.find_many(
        "messages",
        filters,
        sort=[("created_at", -1)],
        limit=1,
    )
    if not latest:
        return {
            "read": True,
            "changed": 0,
            "conversation_realtime_version": conversation_realtime_version(conversation),
            "read_through_message_id": None,
        }

    timestamp = now_iso()
    changed = await database.update_many(
        "messages",
        filters,
        {read_field: True, "updated_at": timestamp},
    )
    if changed == 0:
        current = await database.find_one("conversations", {"id": conversation["id"]}) or conversation
        return {
            "read": True,
            "changed": 0,
            "conversation_realtime_version": conversation_realtime_version(current),
            "read_through_message_id": None,
        }

    updated_conversation = await update_versioned_conversation(
        {"id": conversation["id"]},
        {"updated_at": timestamp},
    )
    if not updated_conversation:
        api_error("Conversation not found.", 404)
    read_through_message_id = str(latest[0].get("id") or "")
    await publish_conversation_realtime(
        updated_conversation,
        "conversation.read_updated",
        reader_user_id=user_id,
        read_through_message_id=read_through_message_id,
    )
    return {
        "read": True,
        "changed": changed,
        "conversation_realtime_version": conversation_realtime_version(updated_conversation),
        "read_through_message_id": read_through_message_id,
    }
