from __future__ import annotations

import re
from typing import Any, Dict, Optional

from app.database import database


_SUPPORT_SEARCH_FIELDS = (
    "subject",
    "message",
    "user_name",
    "user_email",
    "user_phone",
    "status",
)
_SUPPORT_PROJECTION = {
    "_id": 0,
    "id": 1,
    "user_id": 1,
    "user_name": 1,
    "user_email": 1,
    "user_phone": 1,
    "subject": 1,
    "message": 1,
    "status": 1,
    "ride_id": 1,
    "request_id": 1,
    "admin_notes": 1,
    "created_at": 1,
    "updated_at": 1,
    "last_staff_reply_at": 1,
}


def _memory_contains(row: Dict[str, Any], term: str) -> bool:
    if not term:
        return True
    haystack = " ".join(str(row.get(field) or "") for field in _SUPPORT_SEARCH_FIELDS).lower()
    return term in haystack


def _mongo_string(field: str) -> Dict[str, Any]:
    return {
        "$convert": {
            "input": f"${field}",
            "to": "string",
            "onError": "",
            "onNull": "",
        }
    }


async def search_ops_support_messages(
    search: Optional[str],
    status: Optional[str],
    limit: int,
) -> list[Dict[str, Any]]:
    """Preserve Ops Support search semantics without production full-collection reads."""
    term = str(search or "").strip().lower()
    bounded_limit = max(1, min(int(limit), 250))
    filters = {"status": status} if status else None

    if database.db is None:
        rows = await database.find_many(
            "support_messages",
            filters,
            sort=[("updated_at", -1)],
            limit=None if term else bounded_limit,
        )
        return [row for row in rows if _memory_contains(row, term)][:bounded_limit]

    if not term:
        return await database.find_many(
            "support_messages",
            filters,
            sort=[("updated_at", -1)],
            limit=bounded_limit,
        )

    pipeline: list[Dict[str, Any]] = []
    if status:
        pipeline.append({"$match": {"status": status}})

    concat_parts: list[Any] = []
    for index, field in enumerate(_SUPPORT_SEARCH_FIELDS):
        if index:
            concat_parts.append(" ")
        concat_parts.append(_mongo_string(field))

    pipeline.extend(
        [
            {"$addFields": {"_ops_support_haystack": {"$toLower": {"$concat": concat_parts}}}},
            {"$match": {"_ops_support_haystack": {"$regex": re.escape(term)}}},
            {"$sort": {"updated_at": -1}},
            {"$limit": bounded_limit},
            {"$project": _SUPPORT_PROJECTION},
        ]
    )

    return [row async for row in database.db["support_messages"].aggregate(pipeline)]
