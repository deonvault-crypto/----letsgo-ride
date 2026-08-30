from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, List, Optional, Sequence, Tuple

from app.database import database


SortSpec = Sequence[Tuple[str, int]]


def _clean(item: Dict[str, Any]) -> Dict[str, Any]:
    cleaned = dict(item)
    cleaned.pop("_id", None)
    return cleaned


def _memory_sort(rows: List[Dict[str, Any]], sort: Optional[SortSpec]) -> List[Dict[str, Any]]:
    if not sort:
        return rows
    ordered = list(rows)
    # Stable sorts applied from the least-significant key to the most-significant key.
    for field, direction in reversed(list(sort)):
        ordered.sort(
            key=lambda item: (item.get(field) is None, item.get(field)),
            reverse=direction < 0,
        )
    return ordered


async def find_many_bounded(
    collection: str,
    filters: Optional[Dict[str, Any]] = None,
    *,
    sort: Optional[SortSpec] = None,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    """Return a deliberately bounded result set using Mongo sort/limit when available.

    This helper exists for high-growth read paths so callers do not accidentally
    materialize an entire collection in application memory. A finite positive limit
    is required by design.
    """
    if limit <= 0:
        raise ValueError("A positive query limit is required.")
    safe_limit = min(int(limit), 500)
    filters = filters or {}

    if database.db is not None:
        cursor = database.db[collection].find(filters)
        if sort:
            cursor = cursor.sort(list(sort))
        cursor = cursor.limit(safe_limit)
        return [_clean(item) async for item in cursor]

    rows = await database.find_many(collection, filters)
    rows = _memory_sort(rows, sort)
    return [deepcopy(item) for item in rows[:safe_limit]]


async def find_one_sorted(
    collection: str,
    filters: Optional[Dict[str, Any]] = None,
    *,
    sort: Optional[SortSpec] = None,
) -> Optional[Dict[str, Any]]:
    rows = await find_many_bounded(collection, filters, sort=sort, limit=1)
    return rows[0] if rows else None
