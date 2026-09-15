from __future__ import annotations

import re
from typing import Any, Dict, Iterable, Optional

from app.database import database


SUPPORT_SEARCH_FIELDS = ("subject", "message", "user_name", "user_email", "user_phone", "status")
REPORT_SEARCH_FIELDS = ("report_type", "message", "description", "user_name", "user_email", "user_phone", "status")
CASE_SEARCH_FIELDS = ("case_number", "subject", "description", "status", "priority", "assigned_name")

SUPPORT_PROJECTION = {
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

REPORT_PROJECTION = {
    "_id": 0,
    "id": 1,
    "user_id": 1,
    "user_name": 1,
    "user_email": 1,
    "user_phone": 1,
    "report_type": 1,
    "message": 1,
    "description": 1,
    "status": 1,
    "ride_id": 1,
    "request_id": 1,
    "reported_user_id": 1,
    "admin_notes": 1,
    "created_at": 1,
    "updated_at": 1,
}

CASE_PROJECTION = {
    "_id": 0,
    "id": 1,
    "case_number": 1,
    "subject": 1,
    "description": 1,
    "priority": 1,
    "status": 1,
    "escalation_level": 1,
    "source_type": 1,
    "source_id": 1,
    "customer_user_id": 1,
    "assigned_user_id": 1,
    "assigned_name": 1,
    "created_by_user_id": 1,
    "created_at": 1,
    "updated_at": 1,
    "resolved_at": 1,
}


def _contains_joined(row: Dict[str, Any], term: str, fields: Iterable[str]) -> bool:
    if not term:
        return True
    return term in " ".join(str(row.get(field) or "") for field in fields).lower()


def _mongo_string(field: str) -> Dict[str, Any]:
    return {
        "$convert": {
            "input": f"${field}",
            "to": "string",
            "onError": "",
            "onNull": "",
        }
    }


async def _bounded_search(
    collection: str,
    *,
    search: Optional[str],
    filters: Optional[Dict[str, Any]],
    fields: tuple[str, ...],
    limit: int,
    max_limit: int,
    projection: Optional[Dict[str, Any]] = None,
) -> list[Dict[str, Any]]:
    term = str(search or "").strip().lower()
    bounded_limit = max(1, min(int(limit), max_limit))

    if database.db is None:
        rows = await database.find_many(
            collection,
            filters,
            sort=[("updated_at", -1)],
            limit=None if term else bounded_limit,
        )
        return [row for row in rows if _contains_joined(row, term, fields)][:bounded_limit]

    if not term:
        return await database.find_many(
            collection,
            filters,
            sort=[("updated_at", -1)],
            limit=bounded_limit,
        )

    pipeline: list[Dict[str, Any]] = []
    if filters:
        pipeline.append({"$match": filters})

    concat_parts: list[Any] = []
    for index, field in enumerate(fields):
        if index:
            concat_parts.append(" ")
        concat_parts.append(_mongo_string(field))

    pipeline.extend(
        [
            {"$addFields": {"_ops_search_haystack": {"$toLower": {"$concat": concat_parts}}}},
            {"$match": {"_ops_search_haystack": {"$regex": re.escape(term)}}},
            {"$sort": {"updated_at": -1}},
            {"$limit": bounded_limit},
        ]
    )
    pipeline.append({"$project": projection or {"_id": 0, "_ops_search_haystack": 0}})
    return [row async for row in database.db[collection].aggregate(pipeline)]


async def search_ops_support_messages(
    search: Optional[str],
    status: Optional[str],
    limit: int,
) -> list[Dict[str, Any]]:
    return await _bounded_search(
        "support_messages",
        search=search,
        filters={"status": status} if status else None,
        fields=SUPPORT_SEARCH_FIELDS,
        limit=limit,
        max_limit=250,
        projection=SUPPORT_PROJECTION,
    )


async def search_ops_safety_reports(
    search: Optional[str],
    status: Optional[str],
    limit: int,
) -> list[Dict[str, Any]]:
    return await _bounded_search(
        "reports",
        search=search,
        filters={"status": status} if status else None,
        fields=REPORT_SEARCH_FIELDS,
        limit=limit,
        max_limit=250,
        projection=REPORT_PROJECTION,
    )


async def search_ops_cases(
    search: Optional[str],
    filters: Optional[Dict[str, Any]],
    limit: int,
) -> list[Dict[str, Any]]:
    return await _bounded_search(
        "ops_cases",
        search=search,
        filters=filters,
        fields=CASE_SEARCH_FIELDS,
        limit=limit,
        max_limit=250,
        projection=CASE_PROJECTION,
    )


async def list_ops_audit_logs(*, is_admin: bool, limit: int) -> list[Dict[str, Any]]:
    bounded_limit = max(1, min(int(limit), 250))
    if is_admin:
        return await database.find_many(
            "audit_logs",
            sort=[("created_at", -1)],
            limit=bounded_limit,
        )

    if database.db is None:
        rows = await database.find_many("audit_logs", sort=[("created_at", -1)])
        return [
            row
            for row in rows
            if str(row.get("action") or "").startswith("ops_")
        ][:bounded_limit]

    pipeline = [
        {"$match": {"action": {"$regex": r"^ops_"}}},
        {"$sort": {"created_at": -1}},
        {"$limit": bounded_limit},
        {"$project": {"_id": 0}},
    ]
    return [row async for row in database.db["audit_logs"].aggregate(pipeline)]
