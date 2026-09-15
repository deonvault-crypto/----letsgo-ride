from __future__ import annotations

from typing import Any, AsyncIterator, Dict, Optional

from app.database import database
from app.services.admin_read_service import enrich_admin_requests, enrich_admin_rides
from app.services.ride_service import canonical_trip_status


_RIDE_SEARCH_FIELDS = ("origin", "destination", "driver_name", "vehicle", "date", "status")
_REQUEST_SEARCH_FIELDS = (
    "passenger_name",
    "driver_name",
    "passenger_email",
    "driver_email",
    "route",
    "status",
)


def _recent_key(row: Dict[str, Any]) -> str:
    return str(row.get("created_at") or row.get("updated_at") or "")


def _contains_search(row: Dict[str, Any], search: Optional[str], fields: tuple[str, ...]) -> bool:
    if not search:
        return True
    term = search.strip().lower()
    return any(term in str(row.get(field) or "").lower() for field in fields)


def _request_route(request: Dict[str, Any]) -> str:
    snapshot = request.get("ride_snapshot") or {}
    origin = snapshot.get("origin") or "Ride"
    destination = snapshot.get("destination") or "destination"
    return f"{origin} to {destination}"


def _recent_pipeline(filters: Optional[Dict[str, Any]] = None) -> list[Dict[str, Any]]:
    pipeline: list[Dict[str, Any]] = []
    if filters:
        pipeline.append({"$match": filters})
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
            {"$unset": "_admin_recent_at"},
        ]
    )
    return pipeline


async def _mongo_rows(collection: str, filters: Optional[Dict[str, Any]] = None) -> AsyncIterator[Dict[str, Any]]:
    async for row in database.db[collection].aggregate(_recent_pipeline(filters)):
        clean = dict(row)
        clean.pop("_id", None)
        yield clean


def _ride_matches(
    row: Dict[str, Any],
    *,
    search: Optional[str],
    status: Optional[str],
    filter_name: Optional[str],
) -> bool:
    row_status = canonical_trip_status(row.get("status"))
    if status and row_status != canonical_trip_status(status):
        return False
    if filter_name == "pending_requests" and int(row.get("pending_request_count", 0)) == 0:
        return False
    if filter_name == "full" and int(row.get("available_seats", 0)) > 0:
        return False
    if filter_name == "upcoming" and row_status == "CANCELLED":
        return False
    return _contains_search({**row, "status": row_status}, search, _RIDE_SEARCH_FIELDS)


def _request_matches(row: Dict[str, Any], search: Optional[str]) -> bool:
    search_row = {
        **row,
        "route": _request_route(row),
        "driver_name": row.get("driver_name"),
        "passenger_name": row.get("passenger_name"),
    }
    return _contains_search(search_row, search, _REQUEST_SEARCH_FIELDS)


async def list_admin_rides(
    *,
    search: Optional[str],
    status: Optional[str],
    filter_name: Optional[str],
    limit: int,
) -> Dict[str, Any]:
    bounded_limit = max(1, min(int(limit), 200))

    if database.db is None:
        rides = await enrich_admin_rides(await database.find_many("rides"))
        rows = [
            row
            for row in rides
            if _ride_matches(row, search=search, status=status, filter_name=filter_name)
        ]
        rows.sort(key=_recent_key, reverse=True)
        items = rows[:bounded_limit]
        return {"count": len(items), "items": items}

    batch_size = max(50, min(200, bounded_limit * 2))
    batch: list[Dict[str, Any]] = []
    items: list[Dict[str, Any]] = []

    async def consume_batch(rows: list[Dict[str, Any]]) -> None:
        enriched_rows = await enrich_admin_rides(rows)
        for enriched in enriched_rows:
            if _ride_matches(
                enriched,
                search=search,
                status=status,
                filter_name=filter_name,
            ):
                items.append(enriched)
                if len(items) >= bounded_limit:
                    return

    async for ride in _mongo_rows("rides"):
        batch.append(ride)
        if len(batch) < batch_size:
            continue
        await consume_batch(batch)
        batch = []
        if len(items) >= bounded_limit:
            break

    if len(items) < bounded_limit and batch:
        await consume_batch(batch)

    result = items[:bounded_limit]
    return {"count": len(result), "items": result}


async def list_admin_requests(
    *,
    search: Optional[str],
    status: Optional[str],
    limit: int,
) -> Dict[str, Any]:
    bounded_limit = max(1, min(int(limit), 250))
    filters = {"status": status} if status else None

    if database.db is None:
        raw_requests = await database.find_many("ride_requests", filters)
        rows = [
            row
            for row in await enrich_admin_requests(raw_requests)
            if _request_matches(row, search)
        ]
        rows.sort(key=_recent_key, reverse=True)
        items = rows[:bounded_limit]
        return {"count": len(items), "items": items}

    batch_size = max(50, min(250, bounded_limit * 2))
    batch: list[Dict[str, Any]] = []
    items: list[Dict[str, Any]] = []

    async def consume_batch(rows: list[Dict[str, Any]]) -> None:
        enriched_rows = await enrich_admin_requests(rows)
        for enriched in enriched_rows:
            if _request_matches(enriched, search):
                items.append(enriched)
                if len(items) >= bounded_limit:
                    return

    async for request in _mongo_rows("ride_requests", filters):
        batch.append(request)
        if len(batch) < batch_size:
            continue
        await consume_batch(batch)
        batch = []
        if len(items) >= bounded_limit:
            break

    if len(items) < bounded_limit and batch:
        await consume_batch(batch)

    result = items[:bounded_limit]
    return {"count": len(result), "items": result}
