from __future__ import annotations

import re
from typing import Any, Dict

from app.database import database


_RECIPIENT_SEARCH_FIELDS = ("name", "email", "phone", "city", "role")
_RECIPIENT_PROJECTION = {
    "_id": 0,
    "id": 1,
    "name": 1,
    "email": 1,
    "phone": 1,
    "city": 1,
    "role": 1,
    "status": 1,
}


def _memory_haystack(row: Dict[str, Any]) -> str:
    return " ".join(str(row.get(field) or "") for field in _RECIPIENT_SEARCH_FIELDS).lower()


def _mongo_string(field: str) -> Dict[str, Any]:
    return {
        "$convert": {
            "input": f"${field}",
            "to": "string",
            "onError": "",
            "onNull": "",
        }
    }


async def search_support_recipients(search: str, limit: int) -> Dict[str, Any]:
    """Return Support recipient matches without loading the production user collection."""
    term = str(search or "").strip().lower()
    bounded_limit = max(1, min(int(limit), 100))

    if database.db is None:
        rows = await database.find_many("users")
        candidates = [
            row
            for row in rows
            if row.get("status") != "deleted"
            and (not term or term in _memory_haystack(row))
        ]
        candidates.sort(
            key=lambda row: str(row.get("updated_at") or row.get("created_at") or ""),
            reverse=True,
        )
        return {"count": len(candidates), "items": candidates[:bounded_limit]}

    pipeline: list[Dict[str, Any]] = [
        {"$match": {"status": {"$ne": "deleted"}}},
    ]
    if term:
        concat_parts: list[Any] = []
        for index, field in enumerate(_RECIPIENT_SEARCH_FIELDS):
            if index:
                concat_parts.append(" ")
            concat_parts.append(_mongo_string(field))
        pipeline.extend(
            [
                {"$addFields": {"_support_haystack": {"$toLower": {"$concat": concat_parts}}}},
                {"$match": {"_support_haystack": {"$regex": re.escape(term)}}},
            ]
        )

    pipeline.extend(
        [
            {"$addFields": {"_support_recency": {"$ifNull": ["$updated_at", "$created_at"]}}},
            {
                "$facet": {
                    "metadata": [{"$count": "count"}],
                    "items": [
                        {"$sort": {"_support_recency": -1}},
                        {"$limit": bounded_limit},
                        {"$project": _RECIPIENT_PROJECTION},
                    ],
                }
            },
        ]
    )

    result = [row async for row in database.db["users"].aggregate(pipeline)]
    payload = result[0] if result else {}
    metadata = payload.get("metadata") or []
    count = int(metadata[0].get("count", 0)) if metadata else 0
    return {"count": count, "items": list(payload.get("items") or [])}
