from __future__ import annotations

import re
from typing import Any, Dict, Optional

from app.database import database
from app.services.admin_read_service import enrich_admin_users


VERIFIED_DRIVER_VERIFICATION_STATUSES = {"approved", "verified", "active"}
PENDING_DRIVER_VERIFICATION_STATUSES = {
    "pending",
    "pending_uploads",
    "pending_auto_check",
    "needs_review",
    "needs_resubmission",
}
_SEARCH_FIELDS = ("name", "email", "phone", "city", "role", "status")


def _contains_search(row: Dict[str, Any], search: Optional[str]) -> bool:
    if not search:
        return True
    term = search.strip().lower()
    return any(term in str(row.get(field) or "").lower() for field in _SEARCH_FIELDS)


def _is_verified(status: Optional[str]) -> bool:
    return str(status or "").strip().lower() in VERIFIED_DRIVER_VERIFICATION_STATUSES


def _is_pending(status: Optional[str]) -> bool:
    return str(status or "").strip().lower() in PENDING_DRIVER_VERIFICATION_STATUSES


def _verification_matches(enriched: Dict[str, Any], verification: Optional[str]) -> bool:
    if not verification:
        return True
    verification_status = (
        enriched.get("driver_verification_status")
        or enriched.get("verification_status")
        or "not_started"
    )
    requested = str(verification).strip().lower()
    if requested in VERIFIED_DRIVER_VERIFICATION_STATUSES:
        return _is_verified(verification_status)
    if requested in PENDING_DRIVER_VERIFICATION_STATUSES:
        return _is_pending(verification_status)
    return str(verification_status or "").strip().lower() == requested


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


def _mongo_match(
    *,
    search: Optional[str],
    role: Optional[str],
    status: Optional[str],
) -> Dict[str, Any]:
    clauses: list[Dict[str, Any]] = []
    if role:
        clauses.append({"role": role})
    if status:
        clauses.append({"status": status})

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
                        for field in _SEARCH_FIELDS
                    ]
                }
            }
        )

    if not clauses:
        return {}
    if len(clauses) == 1:
        return clauses[0]
    return {"$and": clauses}


def _candidate_pipeline(
    *,
    search: Optional[str],
    role: Optional[str],
    status: Optional[str],
    skip: int,
    limit: int,
) -> list[Dict[str, Any]]:
    match = _mongo_match(search=search, role=role, status=status)
    pipeline: list[Dict[str, Any]] = []
    if match:
        pipeline.append({"$match": match})
    pipeline.extend(
        [
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
        ]
    )
    if skip:
        pipeline.append({"$skip": max(0, int(skip))})
    pipeline.extend(
        [
            {"$limit": max(1, int(limit))},
            {"$unset": "_admin_recent_at"},
        ]
    )
    return pipeline


async def _mongo_candidates(
    *,
    search: Optional[str],
    role: Optional[str],
    status: Optional[str],
    skip: int,
    limit: int,
) -> list[Dict[str, Any]]:
    rows: list[Dict[str, Any]] = []
    pipeline = _candidate_pipeline(
        search=search,
        role=role,
        status=status,
        skip=skip,
        limit=limit,
    )
    async for row in database.db["users"].aggregate(pipeline):
        clean = dict(row)
        clean.pop("_id", None)
        rows.append(clean)
    return rows


async def list_admin_users(
    *,
    search: Optional[str],
    role: Optional[str],
    status: Optional[str],
    verification: Optional[str],
    limit: int,
) -> Dict[str, Any]:
    """Preserve Admin People semantics while bounding production reads and enrichment."""
    bounded_limit = max(1, min(int(limit), 200))

    if database.db is None:
        filters: Dict[str, Any] = {}
        if role:
            filters["role"] = role
        if status:
            filters["status"] = status
        users = await database.find_many("users", filters or None)
        rows = []
        for enriched in await enrich_admin_users(users):
            if not _verification_matches(enriched, verification):
                continue
            if not _contains_search(enriched, search):
                continue
            rows.append(enriched)
        rows.sort(key=_recent_key, reverse=True)
        rows = rows[:bounded_limit]
        return {"count": len(rows), "items": rows}

    if not verification:
        candidates = await _mongo_candidates(
            search=search,
            role=role,
            status=status,
            skip=0,
            limit=bounded_limit,
        )
        enriched = await enrich_admin_users(candidates)
        return {"count": len(enriched), "items": enriched}

    batch_size = max(50, min(200, bounded_limit * 2))
    offset = 0
    matches: list[Dict[str, Any]] = []
    while len(matches) < bounded_limit:
        candidates = await _mongo_candidates(
            search=search,
            role=role,
            status=status,
            skip=offset,
            limit=batch_size,
        )
        if not candidates:
            break
        enriched_batch = await enrich_admin_users(candidates)
        matches.extend(
            row for row in enriched_batch if _verification_matches(row, verification)
        )
        if len(candidates) < batch_size:
            break
        offset += len(candidates)

    items = matches[:bounded_limit]
    return {"count": len(items), "items": items}
