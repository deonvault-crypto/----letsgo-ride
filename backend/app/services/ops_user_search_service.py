from __future__ import annotations

import re
from typing import Any, Dict, Optional

from app.database import database
from app.services.auth_service import public_user


_OPS_USER_SEARCH_FIELDS = ("name", "email", "phone", "city", "role", "status")


def _memory_contains(row: Dict[str, Any], term: str) -> bool:
    if not term:
        return True
    haystack = " ".join(str(row.get(field) or "") for field in _OPS_USER_SEARCH_FIELDS).lower()
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


def _public_ops_user(row: Dict[str, Any], staff_by_user: Dict[str, Any]) -> Dict[str, Any]:
    safe = public_user(row)
    safe.pop("ops_role", None)
    safe.pop("ops_enabled", None)
    safe["operations_role"] = "admin" if row.get("role") == "admin" else staff_by_user.get(row.get("id"))
    return safe


async def search_ops_users(
    search: Optional[str],
    role: Optional[str],
    limit: int,
) -> Dict[str, Any]:
    """Return the current Ops user-search contract without production full-user reads."""
    term = str(search or "").strip().lower()
    bounded_limit = max(1, min(int(limit), 200))
    filters = {"role": role} if role else None

    if database.db is None:
        database.memory.setdefault("ops_staff", [])
        rows = await database.find_many(
            "users",
            filters,
            sort=[("updated_at", -1)],
            limit=None if term else bounded_limit,
        )
        rows = [row for row in rows if _memory_contains(row, term)][:bounded_limit]
    elif not term:
        rows = await database.find_many(
            "users",
            filters,
            sort=[("updated_at", -1)],
            limit=bounded_limit,
        )
    else:
        pipeline: list[Dict[str, Any]] = []
        if role:
            pipeline.append({"$match": {"role": role}})

        concat_parts: list[Any] = []
        for index, field in enumerate(_OPS_USER_SEARCH_FIELDS):
            if index:
                concat_parts.append(" ")
            concat_parts.append(_mongo_string(field))

        pipeline.extend(
            [
                {"$addFields": {"_ops_user_haystack": {"$toLower": {"$concat": concat_parts}}}},
                {"$match": {"_ops_user_haystack": {"$regex": re.escape(term)}}},
                {"$sort": {"updated_at": -1}},
                {"$limit": bounded_limit},
                {"$unset": "_ops_user_haystack"},
            ]
        )
        rows = []
        async for row in database.db["users"].aggregate(pipeline):
            cleaned = dict(row)
            cleaned.pop("_id", None)
            rows.append(cleaned)

    non_admin_ids = [
        row.get("id")
        for row in rows
        if row.get("id") and row.get("role") != "admin"
    ]
    staff_rows = []
    if non_admin_ids:
        if database.db is None:
            database.memory.setdefault("ops_staff", [])
        staff_rows = await database.find_many(
            "ops_staff",
            {
                "enabled": {"$ne": False},
                "user_id": {"$in": non_admin_ids},
            },
            limit=200,
        )
    staff_by_user = {row.get("user_id"): row.get("role") for row in staff_rows}
    items = [_public_ops_user(row, staff_by_user) for row in rows]
    return {"count": len(items), "items": items}
