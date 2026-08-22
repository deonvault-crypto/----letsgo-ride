from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from app.database import database


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
    """Aggregate only completed payouts for the authenticated courier."""
    user_id = str(user.get("id") or "")
    delivered = await database.find_many(
        "courier_deliveries",
        {"courier_user_id": user_id, "status": "DELIVERED"},
    )

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    seven_days_start = now - timedelta(days=7)

    total = 0.0
    today = 0.0
    last_7_days = 0.0
    latest: List[Dict[str, Any]] = []

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
        if delivered_at and delivered_at >= seven_days_start:
            last_7_days += payout

        if len(latest) < 10:
            latest.append(
                {
                    "delivery_id": delivery.get("id"),
                    "payout_usd": payout,
                    "delivered_at": delivery.get("delivered_at") or delivery.get("updated_at"),
                    "source_type": delivery.get("source_type") or "COURIER_REQUEST",
                }
            )

    return {
        "currency": "USD",
        "completed_deliveries": len(delivered),
        "total_payout_usd": round(total, 2),
        "today_payout_usd": round(today, 2),
        "last_7_days_payout_usd": round(last_7_days, 2),
        "latest_payouts": latest,
    }
