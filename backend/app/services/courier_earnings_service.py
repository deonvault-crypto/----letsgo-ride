from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from app.database import database
from app.services.delivery_security_service import distance_meters


def _parse_iso(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    raw = value.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _money(value: Any) -> float:
    try:
        return round(max(0.0, float(value or 0)), 2)
    except (TypeError, ValueError):
        return 0.0


async def courier_earnings_summary(user: Dict[str, Any]) -> Dict[str, Any]:
    """Aggregate accrued delivery earnings without inventing settlement state."""
    user_id = str(user.get("id") or "")
    delivered = await database.find_many(
        "courier_deliveries",
        {"courier_user_id": user_id, "status": "DELIVERED"},
    )

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=6)
    month_start = today_start.replace(day=1)

    total = 0.0
    today = 0.0
    last_7_days = 0.0
    month = 0.0
    latest: List[Dict[str, Any]] = []
    period_rows: Dict[str, List[Dict[str, Any]]] = {"today": [], "week": [], "month": []}

    rows = sorted(
        delivered,
        key=lambda item: str(item.get("delivered_at") or item.get("updated_at") or ""),
        reverse=True,
    )

    for delivery in rows:
        payout = _money(delivery.get("courier_payout_usd"))
        total += payout
        delivered_at = _parse_iso(delivery.get("delivered_at") or delivery.get("updated_at"))
        if delivered_at and delivered_at >= today_start:
            today += payout
        if delivered_at and delivered_at >= week_start:
            last_7_days += payout

        if delivered_at and delivered_at >= month_start:
            month += payout

        snapshots = sorted(
            await database.find_many("courier_location_snapshots", {"delivery_id": delivery.get("id")}),
            key=lambda item: str(item.get("recorded_at") or ""),
        )
        travelled_meters = 0.0
        for previous, current in zip(snapshots, snapshots[1:]):
            segment = distance_meters(previous, current)
            if segment is not None and segment < 10000:
                travelled_meters += segment
        distance_km = round(travelled_meters / 1000.0, 2) if len(snapshots) > 1 else None
        assigned_at = _parse_iso(delivery.get("assigned_at"))
        work_minutes = round(max(0, (delivered_at - assigned_at).total_seconds()) / 60) if delivered_at and assigned_at else None
        job = {
            "delivery_id": delivery.get("id"),
            "payout_usd": payout,
            "delivered_at": delivery.get("delivered_at") or delivery.get("updated_at"),
            "source_type": delivery.get("source_type") or "COURIER_REQUEST",
            "pickup_address": delivery.get("pickup_address"),
            "dropoff_address": delivery.get("dropoff_address"),
            "distance_km": distance_km,
            "work_minutes": work_minutes,
            "payout_status": None,
        }
        if delivered_at:
            if delivered_at >= today_start:
                period_rows["today"].append(job)
            if delivered_at >= week_start:
                period_rows["week"].append(job)
            if delivered_at >= month_start:
                period_rows["month"].append(job)

        if len(latest) < 10:
            latest.append(job)

    sessions = await database.find_many("courier_online_sessions", {"courier_user_id": user_id})
    profile = await database.find_one("courier_profiles", {"user_id": user_id})
    session_ranges: List[tuple[datetime, datetime]] = []
    for session in sessions:
        start = _parse_iso(session.get("started_at"))
        end = _parse_iso(session.get("ended_at"))
        if start and end and end > start:
            session_ranges.append((start, end))
    if profile and profile.get("online"):
        start = _parse_iso(profile.get("online_since"))
        if start and now > start:
            session_ranges.append((start, now))

    def overlap_minutes(start: datetime, end: datetime, period_start: datetime) -> int:
        overlap_start = max(start, period_start)
        overlap_end = min(end, now)
        return max(0, round((overlap_end - overlap_start).total_seconds() / 60))

    def period_summary(name: str, period_start: datetime) -> Dict[str, Any]:
        jobs = period_rows[name]
        known_distances = [float(job["distance_km"]) for job in jobs if isinstance(job.get("distance_km"), (int, float))]
        online_minutes = sum(overlap_minutes(start, end, period_start) for start, end in session_ranges)
        return {
            "accrued_earnings_usd": round(sum(float(job["payout_usd"]) for job in jobs), 2),
            "completed_deliveries": len(jobs),
            "online_minutes": online_minutes,
            "distance_km": round(sum(known_distances), 2) if known_distances else None,
        }

    chart = []
    for offset in range(6, -1, -1):
        day_start = today_start - timedelta(days=offset)
        day_end = day_start + timedelta(days=1)
        chart.append(
            {
                "date": day_start.date().isoformat(),
                "accrued_earnings_usd": round(
                    sum(
                        float(job["payout_usd"])
                        for job in period_rows["week"]
                        if (timestamp := _parse_iso(job.get("delivered_at"))) and day_start <= timestamp < day_end
                    ),
                    2,
                ),
            }
        )

    return {
        "currency": "USD",
        "completed_deliveries": len(delivered),
        "total_payout_usd": round(total, 2),
        "today_payout_usd": round(today, 2),
        "last_7_days_payout_usd": round(last_7_days, 2),
        "month_payout_usd": round(month, 2),
        "latest_payouts": latest,
        "periods": {
            "today": period_summary("today", today_start),
            "week": period_summary("week", week_start),
            "month": period_summary("month", month_start),
        },
        "weekly_chart": chart,
        "settlement_integrated": False,
        "payout_history": [],
    }
