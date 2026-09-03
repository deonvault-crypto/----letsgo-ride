from __future__ import annotations

import logging
from typing import Any, Dict

from app.database import database
from app.models.event import RealtimeAudience
from app.services.event_service import realtime_event_service


logger = logging.getLogger(__name__)


def support_realtime_version(ticket: Dict[str, Any]) -> int:
    value = ticket.get("realtime_version", 0)
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else 0


async def update_versioned_support_message(
    message_id: str,
    updates: Dict[str, Any],
) -> Dict[str, Any] | None:
    return await database.update_one_atomic(
        "support_messages",
        {"id": message_id},
        updates,
        {"realtime_version": 1},
    )


async def _audience(ticket: Dict[str, Any]) -> RealtimeAudience:
    staff_rows = await database.find_many(
        "ops_staff",
        {"enabled": {"$ne": False}},
        limit=500,
    )
    user_ids = {
        str(value)
        for value in (
            ticket.get("user_id"),
            *(row.get("user_id") for row in staff_rows),
        )
        if value
    }
    return RealtimeAudience(
        user_ids=frozenset(user_ids),
        roles=frozenset({"admin"}),
    )


async def publish_support_realtime(ticket: Dict[str, Any], event_type: str) -> bool:
    """Best-effort support notification with no message body in the realtime payload.

    Authorized clients reconcile the protected thread endpoint after receiving this
    signal. Keeping conversation text out of Redis/WebSocket events minimizes the
    amount of support content carried through the realtime transport.
    """
    try:
        published = await realtime_event_service.publish(
            realtime_event_service.build_event(
                event_type=event_type,
                resource_type="support_message",
                resource_id=str(ticket.get("id") or ""),
                version=support_realtime_version(ticket),
                audience=await _audience(ticket),
                payload={
                    "support_message_id": ticket.get("id"),
                    "status": ticket.get("status"),
                    "updated_at": ticket.get("updated_at"),
                },
            )
        )
        if not published:
            logger.warning(
                "support_realtime_unavailable support_message_id=%s version=%s",
                ticket.get("id"),
                support_realtime_version(ticket),
            )
        return published
    except Exception as exc:
        logger.warning(
            "support_realtime_publish_failed support_message_id=%s version=%s error=%s",
            ticket.get("id"),
            support_realtime_version(ticket),
            type(exc).__name__,
        )
        return False
