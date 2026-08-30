import asyncio
from typing import Any, Dict

from app.services.courier_scale_service import list_user_deliveries_scaled
from app.services.database_scale_service import find_many_bounded
from app.services.food_scale_service import list_customer_orders_scaled
from app.services.ride_request_realtime_service import enrich_ride_request


ACTIVITY_RIDE_LIMIT = 50


async def get_customer_activity(user: Dict[str, Any]) -> Dict[str, Any]:
    """Compose a bounded customer Activity read model from canonical domain data."""
    user_id = str(user.get("id") or "")
    ride_requests, food_orders, courier_deliveries = await asyncio.gather(
        find_many_bounded(
            "ride_requests",
            {"user_id": user_id},
            sort=[("updated_at", -1)],
            limit=ACTIVITY_RIDE_LIMIT,
        ),
        list_customer_orders_scaled(user),
        list_user_deliveries_scaled(user),
    )
    enriched_rides = await asyncio.gather(
        *(enrich_ride_request(request, user) for request in ride_requests),
    )
    return {
        "rides": list(enriched_rides),
        "food_orders": food_orders,
        "courier_deliveries": courier_deliveries,
    }
