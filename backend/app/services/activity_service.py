import asyncio
from typing import Any, Dict

from app.database import database
from app.services.courier_service import list_user_deliveries
from app.services.food_service import list_customer_orders
from app.services.ride_request_realtime_service import enrich_ride_request


async def get_customer_activity(user: Dict[str, Any]) -> Dict[str, Any]:
    """Compose the customer Activity read model from canonical domain services."""
    user_id = str(user.get("id") or "")
    ride_requests, food_orders, courier_deliveries = await asyncio.gather(
        database.find_many("ride_requests", {"user_id": user_id}),
        list_customer_orders(user),
        list_user_deliveries(user),
    )
    enriched_rides = await asyncio.gather(
        *(enrich_ride_request(request, user) for request in ride_requests),
    )
    return {
        "rides": list(enriched_rides),
        "food_orders": food_orders,
        "courier_deliveries": courier_deliveries,
    }
