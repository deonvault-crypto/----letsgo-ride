from __future__ import annotations

import re
from typing import Any, Dict, Optional

from app.database import database


SUPPORT_SEARCH_FIELDS = ("subject", "message", "user_name", "user_email", "user_phone", "status")
REPORT_SEARCH_FIELDS = ("report_type", "message", "user_name", "user_email", "user_phone", "status")


def _contains_any(row: Dict[str, Any], search: Optional[str], fields: tuple[str, ...]) -> bool:
    if not search:
        return True
    term = search.strip().lower()
    return any(term in str(row.get(field) or "").lower() for field in fields)


def _recent_key(row: Dict[str, Any]) -> str:
    return str(row.get("created_at") or row.get("updated_at") or "")


def _mongo_string(field: str) -> Dict[str, Any]:
    return {
        "$convert": {
            "input": f"${field}",
            "to": "string",
            "onError": "",
            "onNull": "",
        }
    }


def _recent_sort_stages(limit: int) -> list[Dict[str, Any]]:
    return [
        {
            "$addFields": {
                "_admin_recent_at": {
                    "$cond": [
                        {
                            "$and": [
                                {"$ne": [{"$ifNull": ["$created_at", None]}, None]},
                                {"$ne": ["$created_at", ""]},
                            ]
                        },
                        "$created_at",
                        {"$ifNull": ["$updated_at", ""]},
                    ]
                }
            }
        },
        {"$sort": {"_admin_recent_at": -1}},
        {"$limit": max(1, int(limit))},
        {"$unset": "_admin_recent_at"},
    ]


async def _bounded_search_list(
    collection: str,
    *,
    search: Optional[str],
    filters: Optional[Dict[str, Any]],
    fields: tuple[str, ...],
    limit: int,
    max_limit: int,
) -> list[Dict[str, Any]]:
    bounded_limit = max(1, min(int(limit), max_limit))

    if database.db is None:
        rows = await database.find_many(collection, filters)
        rows = [row for row in rows if _contains_any(row, search, fields)]
        rows.sort(key=_recent_key, reverse=True)
        return rows[:bounded_limit]

    clauses: list[Dict[str, Any]] = []
    if filters:
        clauses.append(filters)
    term = str(search or "").strip()
    if term:
        escaped = re.escape(term)
        clauses.append(
            {
                "$expr": {
                    "$or": [
                        {
                            "$regexMatch": {
                                "input": _mongo_string(field),
                                "regex": escaped,
                                "options": "i",
                            }
                        }
                        for field in fields
                    ]
                }
            }
        )

    pipeline: list[Dict[str, Any]] = []
    if clauses:
        pipeline.append({"$match": clauses[0] if len(clauses) == 1 else {"$and": clauses}})
    pipeline.extend(_recent_sort_stages(bounded_limit))

    rows: list[Dict[str, Any]] = []
    async for row in database.db[collection].aggregate(pipeline):
        clean = dict(row)
        clean.pop("_id", None)
        rows.append(clean)
    return rows


async def list_admin_support_messages(
    *,
    search: Optional[str],
    status: Optional[str],
    limit: int,
) -> list[Dict[str, Any]]:
    return await _bounded_search_list(
        "support_messages",
        search=search,
        filters={"status": status} if status else None,
        fields=SUPPORT_SEARCH_FIELDS,
        limit=limit,
        max_limit=250,
    )


async def list_admin_reports(
    *,
    search: Optional[str],
    status: Optional[str],
    limit: int,
) -> list[Dict[str, Any]]:
    return await _bounded_search_list(
        "reports",
        search=search,
        filters={"status": status} if status else None,
        fields=REPORT_SEARCH_FIELDS,
        limit=limit,
        max_limit=250,
    )


async def list_admin_audit_logs(
    *,
    action: Optional[str],
    target_type: Optional[str],
    limit: int,
) -> list[Dict[str, Any]]:
    bounded_limit = max(1, min(int(limit), 200))
    filters: Dict[str, Any] = {}
    if action:
        filters["action"] = action
    if target_type:
        filters["target_type"] = target_type

    if database.db is None:
        rows = await database.find_many("audit_logs", filters or None)
        rows.sort(key=_recent_key, reverse=True)
        return rows[:bounded_limit]

    pipeline: list[Dict[str, Any]] = []
    if filters:
        pipeline.append({"$match": filters})
    pipeline.extend(_recent_sort_stages(bounded_limit))
    rows: list[Dict[str, Any]] = []
    async for row in database.db["audit_logs"].aggregate(pipeline):
        clean = dict(row)
        clean.pop("_id", None)
        rows.append(clean)
    return rows
