from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict
from zoneinfo import ZoneInfo

from app.database import database
from app.services.hailing_trip_service import driver_profile_for_user
from app.services.worker_finance_service import _driver_trip_financials


HARARE_TZ = ZoneInfo("Africa/Harare")


def _harare_day_window_utc(now: datetime | None = None) -> tuple[str, str]:
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    local = current.astimezone(HARARE_TZ)
    start_local = local.replace(hour=0, minute=0, second=0, microsecond=0)
    end_local = start_local + timedelta(days=1)
    return start_local.astimezone(timezone.utc).isoformat(), end_local.astimezone(timezone.utc).isoformat()


async def driver_stats(user: Dict[str, Any]) -> Dict[str, Any]:
    """Return today's Ride Now earnings using the actual settlement policy.

    The query is bounded to the current Africa/Harare reporting day and matches the
    hailing_driver_completed_stats index. Cash trips count at 100% driver earnings;
    platform commission is counted only for card-paid trips.
    """

    driver = await driver_profile_for_user(user)
    day_start, day_end = _harare_day_window_utc()
    trips = await database.find_many(
        "hailing_trips",
        {
            "driver_id": driver["id"],
            "status": "COMPLETED",
            "completed_at": {"$gte": day_start, "$lt": day_end},
        },
        sort=[("completed_at", -1)],
    )

    gross = 0.0
    commission = 0.0
    earnings = 0.0
    for trip in trips:
        settlement = _driver_trip_financials(trip)
        gross += settlement["gross_usd"]
        commission += settlement["platform_commission_usd"]
        earnings += settlement["worker_earnings_usd"]

    return {
        "driver_id": driver["id"],
        "today_ride_count": len(trips),
        "today_gross_fares": round(gross, 2),
        "today_platform_commission": round(commission, 2),
        "today_estimated_earnings": round(earnings, 2),
    }
