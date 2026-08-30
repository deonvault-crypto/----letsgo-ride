from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from app.database import database
from app.services.database_scale_service import find_many_bounded, find_one_sorted
from app.services.hailing_dispatch_service import release_candidate_reservation
from app.services.hailing_realtime_service import publish_hailing_driver_offer_realtime
from app.services.hailing_trip_service import (
    close_search_no_driver,
    create_dispatch_offer,
    driver_profile_for_user,
    list_hailing_city_dispatch_settings,
    parse_time,
)
from app.utils import now_iso


logger = logging.getLogger(__name__)
HAILING_WORK_BATCH = 100
HAILING_RETRY_SECONDS = 3
HARARE_TZ = timezone(timedelta(hours=2))


def _next_dispatch_time(
    trip: Dict[str, Any],
    *,
    pending_offer: Optional[Dict[str, Any]] = None,
    now: Optional[datetime] = None,
) -> str:
    now = now or datetime.now(timezone.utc)
    candidates: List[datetime] = [now + timedelta(seconds=HAILING_RETRY_SECONDS)]
    search_expiry = parse_time(trip.get("search_expires_at"))
    if search_expiry:
        candidates.append(search_expiry)
    if pending_offer:
        offer_expiry = parse_time(pending_offer.get("expires_at"))
        if offer_expiry:
            candidates.append(offer_expiry)
    return min(candidates).isoformat()


async def _schedule_search_work(
    trip: Dict[str, Any],
    *,
    pending_offer: Optional[Dict[str, Any]] = None,
    now: Optional[datetime] = None,
) -> None:
    await database.update_one_if(
        "hailing_trips",
        {"id": trip["id"], "status": "SEARCHING"},
        {
            "next_dispatch_at": _next_dispatch_time(trip, pending_offer=pending_offer, now=now),
            "updated_at": now_iso(),
        },
    )


async def expire_due_pending_offers() -> int:
    """Expire only offers that are actually due, in a bounded indexed batch."""
    now = datetime.now(timezone.utc)
    due = await find_many_bounded(
        "hailing_dispatch_offers",
        {"status": "pending", "expires_at": {"$lte": now.isoformat()}},
        sort=[("expires_at", 1)],
        limit=HAILING_WORK_BATCH,
    )
    changed = 0
    for offer in due:
        expired = await database.update_one_if(
            "hailing_dispatch_offers",
            {"id": offer["id"], "status": "pending"},
            {"status": "expired", "expired_at": now_iso(), "updated_at": now_iso()},
        )
        if not expired:
            continue
        changed += 1
        await publish_hailing_driver_offer_realtime(expired, "hailing.offer.expired", version=2)
        driver_id = offer.get("driver_id")
        if driver_id:
            await release_candidate_reservation(str(driver_id), str(offer.get("trip_id") or ""))
        trip = await database.find_one("hailing_trips", {"id": offer.get("trip_id")})
        if trip and trip.get("status") == "SEARCHING":
            await create_dispatch_offer(trip)
            refreshed = await database.find_one("hailing_trips", {"id": trip["id"]}) or trip
            next_offer = await find_one_sorted(
                "hailing_dispatch_offers",
                {"trip_id": trip["id"], "status": "pending"},
                sort=[("expires_at", 1)],
            )
            await _schedule_search_work(refreshed, pending_offer=next_offer, now=now)
    return changed


async def sweep_due_searching_trips() -> Dict[str, int]:
    """Process a bounded, index-ordered Ride Now work queue.

    Missing ``next_dispatch_at`` values sort first, which transparently backfills
    legacy/current records without a collection-wide migration. Once a trip is
    inspected it receives its next due timestamp, so pending offers do not occupy
    the hot front of the queue every three seconds.
    """
    now = datetime.now(timezone.utc)
    searching = await find_many_bounded(
        "hailing_trips",
        {"status": "SEARCHING"},
        sort=[("next_dispatch_at", 1)],
        limit=HAILING_WORK_BATCH,
    )
    checked = 0
    dispatched = 0
    timed_out = 0
    for trip in searching:
        due_at = parse_time(trip.get("next_dispatch_at"))
        if due_at and due_at > now:
            # The queue is ordered by next_dispatch_at; later records are not due.
            break
        checked += 1
        search_expiry = parse_time(trip.get("search_expires_at"))
        if search_expiry and search_expiry <= now:
            await close_search_no_driver(trip, "search_timeout")
            timed_out += 1
            continue

        pending = await find_one_sorted(
            "hailing_dispatch_offers",
            {"trip_id": trip["id"], "status": "pending"},
            sort=[("expires_at", 1)],
        )
        if pending:
            await _schedule_search_work(trip, pending_offer=pending, now=now)
            continue

        offer = await create_dispatch_offer(trip)
        if offer:
            dispatched += 1
        refreshed = await database.find_one("hailing_trips", {"id": trip["id"]}) or trip
        if refreshed.get("status") == "SEARCHING":
            pending = await find_one_sorted(
                "hailing_dispatch_offers",
                {"trip_id": trip["id"], "status": "pending"},
                sort=[("expires_at", 1)],
            )
            await _schedule_search_work(refreshed, pending_offer=pending, now=now)

    return {"checked": checked, "dispatched": dispatched, "timed_out": timed_out}


async def sweep_hailing_dispatch_scaled() -> Dict[str, int]:
    expired = await expire_due_pending_offers()
    searching = await sweep_due_searching_trips()
    return {"expired_offers": expired, **searching}


async def hailing_dispatch_sweeper_scaled(stop_event: asyncio.Event) -> None:
    """Scale-safe replacement for the legacy all-SEARCHING/all-pending sweeper."""
    while not stop_event.is_set():
        interval = HAILING_RETRY_SECONDS
        try:
            cities = await list_hailing_city_dispatch_settings()
            if cities:
                interval = max(
                    2,
                    min(int(city.get("dispatch_sweeper_interval_seconds") or HAILING_RETRY_SECONDS) for city in cities),
                )
            await sweep_hailing_dispatch_scaled()
        except Exception as exc:
            logger.warning("hailing_dispatch_scale_sweep_failed error_type=%s", exc.__class__.__name__)
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval)
        except asyncio.TimeoutError:
            continue


async def driver_stats_scaled(user: Dict[str, Any]) -> Dict[str, Any]:
    """Calculate today's driver totals in Mongo instead of loading lifetime trips."""
    driver = await driver_profile_for_user(user)
    local_now = datetime.now(HARARE_TZ)
    local_start = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    start_utc = local_start.astimezone(timezone.utc)
    end_utc = (local_start + timedelta(days=1)).astimezone(timezone.utc)
    filters = {
        "driver_id": driver["id"],
        "status": "COMPLETED",
        "completed_at": {"$gte": start_utc.isoformat(), "$lt": end_utc.isoformat()},
    }

    if database.db is not None:
        pipeline = [
            {"$match": filters},
            {
                "$group": {
                    "_id": None,
                    "ride_count": {"$sum": 1},
                    "gross": {"$sum": {"$ifNull": ["$fare.total_fare", 0]}},
                    "commission": {"$sum": {"$ifNull": ["$fare.platform_commission", 0]}},
                }
            },
        ]
        rows = [item async for item in database.db["hailing_trips"].aggregate(pipeline)]
        summary = rows[0] if rows else {}
        count = int(summary.get("ride_count") or 0)
        gross = float(summary.get("gross") or 0)
        commission = float(summary.get("commission") or 0)
    else:
        trips = await database.find_many("hailing_trips", filters)
        count = len(trips)
        gross = sum(float((trip.get("fare") or {}).get("total_fare") or 0) for trip in trips)
        commission = sum(float((trip.get("fare") or {}).get("platform_commission") or 0) for trip in trips)

    return {
        "driver_id": driver["id"],
        "today_ride_count": count,
        "today_gross_fares": round(gross, 2),
        "today_platform_commission": round(commission, 2),
        "today_estimated_earnings": round(max(0, gross - commission), 2),
    }
