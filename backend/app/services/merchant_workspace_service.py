from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from app.database import database
from app.services.merchant_service import require_restaurant_access


async def get_restaurant_workspace(restaurant_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    restaurant = await require_restaurant_access(restaurant_id, user)
    categories = await database.find_many("menu_categories", {"restaurant_id": restaurant_id})
    items = await database.find_many("menu_items", {"restaurant_id": restaurant_id})
    orders = await database.find_many("food_orders", {"restaurant_id": restaurant_id})

    categories = sorted(categories, key=lambda item: int(item.get("sort_order") or 0))
    items = sorted(items, key=lambda item: (str(item.get("category_id") or ""), str(item.get("name") or "").lower()))
    orders = sorted(orders, key=lambda item: str(item.get("created_at") or ""), reverse=True)

    return {
        "restaurant": restaurant,
        "categories": categories,
        "items": items,
        "orders": orders,
    }


def _parse_iso(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


async def get_restaurant_insights(restaurant_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    await require_restaurant_access(restaurant_id, user)
    orders = await database.find_many("food_orders", {"restaurant_id": restaurant_id})
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=6)
    month_start = today_start - timedelta(days=29)

    completed = [order for order in orders if str(order.get("status") or order.get("fulfillment_status") or "") == "DELIVERED"]
    accepted = [order for order in orders if order.get("accepted_at")]
    rejected = [order for order in orders if str(order.get("status") or "") in {"REJECTED", "CANCELLED"}]

    prep_minutes = []
    for order in orders:
        accepted_at = _parse_iso(order.get("accepted_at"))
        ready_at = _parse_iso(order.get("ready_for_pickup_at"))
        if accepted_at and ready_at and ready_at >= accepted_at:
            prep_minutes.append((ready_at - accepted_at).total_seconds() / 60)

    def period(start: datetime) -> Dict[str, Any]:
        period_orders = [order for order in orders if (timestamp := _parse_iso(order.get("created_at"))) and timestamp >= start]
        period_completed = [order for order in completed if (timestamp := _parse_iso(order.get("delivered_at") or order.get("updated_at"))) and timestamp >= start]
        return {
            "orders": len(period_orders),
            "completed_orders": len(period_completed),
            "recorded_sales_usd": round(sum(float(order.get("total_usd") or 0) for order in period_completed), 2),
        }

    chart = []
    for offset in range(6, -1, -1):
        start = today_start - timedelta(days=offset)
        end = start + timedelta(days=1)
        day_completed = [
            order
            for order in completed
            if (timestamp := _parse_iso(order.get("delivered_at") or order.get("updated_at"))) and start <= timestamp < end
        ]
        chart.append({
            "date": start.date().isoformat(),
            "orders": len(day_completed),
            "recorded_sales_usd": round(sum(float(order.get("total_usd") or 0) for order in day_completed), 2),
        })

    return {
        "currency": "USD",
        "total_orders": len(orders),
        "accepted_orders": len(accepted),
        "completed_orders": len(completed),
        "rejected_or_cancelled_orders": len(rejected),
        "recorded_sales_usd": round(sum(float(order.get("total_usd") or 0) for order in completed), 2),
        "average_preparation_minutes": round(sum(prep_minutes) / len(prep_minutes)) if prep_minutes else None,
        "periods": {"today": period(today_start), "week": period(week_start), "month": period(month_start)},
        "weekly_chart": chart,
        "payment_method": "CASH_ON_DELIVERY",
        "settlement_integrated": False,
        "payout_history": [],
    }
