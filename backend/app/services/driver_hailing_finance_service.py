from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict
from zoneinfo import ZoneInfo

from app.database import database


HARARE_TZ = ZoneInfo("Africa/Harare")
CARD_SETTLED_STATUSES = {"paid"}


def _money(value: Any) -> float:
    try:
        return round(float(value or 0), 2)
    except (TypeError, ValueError):
        return 0.0


def _harare_day_start_utc(now: datetime | None = None) -> datetime:
    current = now or datetime.now(timezone.utc)
    local = current.astimezone(HARARE_TZ)
    local_start = local.replace(hour=0, minute=0, second=0, microsecond=0)
    return local_start.astimezone(timezone.utc)


def _trip_recognized_finance(trip: Dict[str, Any]) -> Dict[str, float]:
    """Return driver-recognized earnings for a completed Ride Now trip.

    Launch policy:
    - cash is collected by the driver and belongs to the driver in full;
    - LetsGoRide only recognizes its platform percentage on settled card rides;
    - unresolved/failed card settlement is not treated as earned/withdrawable money.
    """

    fare = trip.get("fare") or {}
    gross = _money(fare.get("total_fare"))
    payment_method = str(trip.get("payment_method") or "cash").strip().lower()
    payment_status = str(trip.get("payment_status") or "").strip().lower()

    if payment_method == "cash":
        return {"gross": gross, "commission": 0.0, "earnings": gross}

    if payment_status not in CARD_SETTLED_STATUSES:
        return {"gross": gross, "commission": 0.0, "earnings": 0.0}

    commission = min(gross, _money(fare.get("platform_commission")))
    return {
        "gross": gross,
        "commission": commission,
        "earnings": _money(max(0.0, gross - commission)),
    }


async def driver_daily_stats(driver_id: str, *, now: datetime | None = None) -> Dict[str, Any]:
    day_start = _harare_day_start_utc(now)
    start_text = day_start.isoformat()

    if database.db is None:
        trips = await database.find_many(
            "hailing_trips",
            {
                "driver_id": driver_id,
                "status": "COMPLETED",
                "completed_at": {"$gte": start_text},
            },
            sort=[("completed_at", -1)],
        )
        gross = commission = earnings = 0.0
        for trip in trips:
            finance = _trip_recognized_finance(trip)
            gross += finance["gross"]
            commission += finance["commission"]
            earnings += finance["earnings"]
        return {
            "today_ride_count": len(trips),
            "today_gross_fares": _money(gross),
            "today_platform_commission": _money(commission),
            "today_estimated_earnings": _money(earnings),
        }

    pipeline = [
        {
            "$match": {
                "driver_id": driver_id,
                "status": "COMPLETED",
                "completed_at": {"$gte": start_text},
            }
        },
        {
            "$project": {
                "gross": {"$ifNull": ["$fare.total_fare", 0]},
                "quoted_commission": {"$ifNull": ["$fare.platform_commission", 0]},
                "payment_method": {"$toLower": {"$ifNull": ["$payment_method", "cash"]}},
                "payment_status": {"$toLower": {"$ifNull": ["$payment_status", ""]}},
            }
        },
        {
            "$group": {
                "_id": None,
                "ride_count": {"$sum": 1},
                "gross": {"$sum": "$gross"},
                "cash_earnings": {
                    "$sum": {
                        "$cond": [
                            {"$eq": ["$payment_method", "cash"]},
                            "$gross",
                            0,
                        ]
                    }
                },
                "settled_card_gross": {
                    "$sum": {
                        "$cond": [
                            {
                                "$and": [
                                    {"$ne": ["$payment_method", "cash"]},
                                    {"$eq": ["$payment_status", "paid"]},
                                ]
                            },
                            "$gross",
                            0,
                        ]
                    }
                },
                "settled_card_commission": {
                    "$sum": {
                        "$cond": [
                            {
                                "$and": [
                                    {"$ne": ["$payment_method", "cash"]},
                                    {"$eq": ["$payment_status", "paid"]},
                                ]
                            },
                            "$quoted_commission",
                            0,
                        ]
                    }
                },
            }
        },
    ]
    rows = await database.db["hailing_trips"].aggregate(pipeline).to_list(length=1)
    row = rows[0] if rows else {}
    gross = _money(row.get("gross"))
    cash_earnings = _money(row.get("cash_earnings"))
    settled_card_gross = _money(row.get("settled_card_gross"))
    commission = _money(min(settled_card_gross, _money(row.get("settled_card_commission"))))
    card_earnings = _money(max(0.0, settled_card_gross - commission))
    return {
        "today_ride_count": int(row.get("ride_count") or 0),
        "today_gross_fares": gross,
        "today_platform_commission": commission,
        "today_estimated_earnings": _money(cash_earnings + card_earnings),
    }
