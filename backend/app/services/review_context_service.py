from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional

from app.database import database


@dataclass(frozen=True, slots=True)
class ReviewContext:
    transaction_id: str
    transaction_type: str
    reviewer_role: str
    reviewee_id: str
    reviewee_role: str
    reviewee_kind: str
    subject: Dict[str, Any]
    notification_data: Dict[str, Any]


def review_transaction_id(review: Dict[str, Any]) -> str:
    return str(review.get("transaction_id") or review.get("trip_id") or "")


def review_transaction_type(review: Dict[str, Any]) -> str:
    return str(review.get("transaction_type") or review.get("trip_type") or "intercity")


async def _confirmed_requests_for_ride(ride_id: str) -> list[Dict[str, Any]]:
    requests = await database.find_many("ride_requests", {"ride_id": ride_id})
    return [request for request in requests if request.get("status") == "confirmed" and request.get("user_id")]


async def _resolve_intercity(transaction_id: str, reviewee_id: str, user: Dict[str, Any]) -> Optional[ReviewContext]:
    from app.services.ride_service import TRIP_STATUS_COMPLETED, apply_ride_lifecycle, canonical_trip_status

    ride = await database.find_one("rides", {"id": transaction_id})
    if not ride:
        return None
    ride = await apply_ride_lifecycle(ride)
    if canonical_trip_status(ride.get("status")) != TRIP_STATUS_COMPLETED:
        raise ValueError("Reviews unlock after a completed trip.")

    driver_user_id = str(ride.get("user_id") or "")
    confirmed = await _confirmed_requests_for_ride(ride["id"])
    passenger_ids = {str(request.get("user_id") or "") for request in confirmed}
    user_id = str(user.get("id") or "")
    if user_id == driver_user_id:
        if reviewee_id not in passenger_ids:
            raise PermissionError("Drivers can only review confirmed passengers on this trip.")
        reviewer_role, reviewee_role = "driver", "passenger"
    elif user_id in passenger_ids:
        if reviewee_id != driver_user_id:
            raise PermissionError("Passengers can only review the driver for this trip.")
        reviewer_role, reviewee_role = "passenger", "driver"
    else:
        raise PermissionError("Only confirmed trip participants can leave reviews.")
    return ReviewContext(
        transaction_id=ride["id"],
        transaction_type="intercity",
        reviewer_role=reviewer_role,
        reviewee_id=reviewee_id,
        reviewee_role=reviewee_role,
        reviewee_kind="user",
        subject=ride,
        notification_data={"ride_id": ride["id"]},
    )


async def _resolve_hailing(transaction_id: str, reviewee_id: str, user: Dict[str, Any]) -> Optional[ReviewContext]:
    trip = await database.find_one("hailing_trips", {"id": transaction_id})
    if not trip:
        return None
    if trip.get("status") != "COMPLETED":
        raise ValueError("Reviews unlock after a completed trip.")
    driver_user_id = str(trip.get("driver_user_id") or "")
    passenger_user_id = str(trip.get("passenger_user_id") or "")
    user_id = str(user.get("id") or "")
    if user_id == driver_user_id:
        if reviewee_id != passenger_user_id:
            raise PermissionError("Drivers can only review the passenger on this Ride Now trip.")
        reviewer_role, reviewee_role = "driver", "passenger"
    elif user_id == passenger_user_id:
        if reviewee_id != driver_user_id:
            raise PermissionError("Passengers can only review the driver on this Ride Now trip.")
        reviewer_role, reviewee_role = "passenger", "driver"
    else:
        raise PermissionError("Only Ride Now trip participants can leave reviews.")
    return ReviewContext(
        transaction_id=trip["id"],
        transaction_type="hailing",
        reviewer_role=reviewer_role,
        reviewee_id=reviewee_id,
        reviewee_role=reviewee_role,
        reviewee_kind="user",
        subject=trip,
        notification_data={"hailing_trip_id": trip["id"], "notification_target": "hailing_trip"},
    )


async def _resolve_courier(transaction_id: str, reviewee_id: str, user: Dict[str, Any]) -> Optional[ReviewContext]:
    delivery = await database.find_one("courier_deliveries", {"id": transaction_id})
    if not delivery:
        return None
    if delivery.get("status") != "DELIVERED":
        raise ValueError("Reviews unlock after a completed delivery.")
    user_id = str(user.get("id") or "")
    courier_user_id = str(delivery.get("courier_user_id") or "")
    if user_id != str(delivery.get("sender_user_id") or ""):
        raise PermissionError("Only the customer who booked this delivery can review its courier.")
    if not courier_user_id or reviewee_id != courier_user_id:
        raise PermissionError("Customers can only review the courier assigned to this delivery.")
    return ReviewContext(
        transaction_id=delivery["id"],
        transaction_type="courier",
        reviewer_role="customer",
        reviewee_id=courier_user_id,
        reviewee_role="courier",
        reviewee_kind="user",
        subject=delivery,
        notification_data={"delivery_id": delivery["id"], "notification_target": "courier_delivery"},
    )


async def _resolve_food_restaurant(transaction_id: str, reviewee_id: str, user: Dict[str, Any]) -> Optional[ReviewContext]:
    order = await database.find_one("food_orders", {"id": transaction_id})
    if not order:
        return None
    if order.get("status") != "DELIVERED" and order.get("fulfillment_status") != "DELIVERED":
        raise ValueError("Reviews unlock after a delivered food order.")
    if str(order.get("customer_user_id") or "") != str(user.get("id") or ""):
        raise PermissionError("Only the customer who placed this order can review it.")
    restaurant_id = str(order.get("restaurant_id") or "")
    if not restaurant_id or reviewee_id != restaurant_id:
        raise PermissionError("This review can only rate the restaurant that prepared the order.")
    return ReviewContext(
        transaction_id=order["id"],
        transaction_type="food_restaurant",
        reviewer_role="customer",
        reviewee_id=restaurant_id,
        reviewee_role="restaurant",
        reviewee_kind="restaurant",
        subject=order,
        notification_data={"food_order_id": order["id"], "restaurant_id": restaurant_id, "notification_target": "customer_food_order"},
    )


async def _resolve_food_courier(transaction_id: str, reviewee_id: str, user: Dict[str, Any]) -> Optional[ReviewContext]:
    order = await database.find_one("food_orders", {"id": transaction_id})
    if not order:
        return None
    if order.get("status") != "DELIVERED" and order.get("fulfillment_status") != "DELIVERED":
        raise ValueError("Reviews unlock after a delivered food order.")
    if str(order.get("customer_user_id") or "") != str(user.get("id") or ""):
        raise PermissionError("Only the customer who placed this order can review its courier.")
    delivery_id = str(order.get("courier_delivery_id") or "")
    delivery = await database.find_one("courier_deliveries", {"id": delivery_id}) if delivery_id else None
    courier_user_id = str((delivery or {}).get("courier_user_id") or "")
    if not courier_user_id:
        raise ValueError("This food order did not have a courier to review.")
    if reviewee_id != courier_user_id:
        raise PermissionError("This review can only rate the courier who delivered the order.")
    return ReviewContext(
        transaction_id=order["id"],
        transaction_type="food_courier",
        reviewer_role="customer",
        reviewee_id=courier_user_id,
        reviewee_role="courier",
        reviewee_kind="user",
        subject=order,
        notification_data={"food_order_id": order["id"], "delivery_id": delivery_id, "notification_target": "customer_food_order"},
    )


_RESOLVERS = {
    "intercity": _resolve_intercity,
    "hailing": _resolve_hailing,
    "courier": _resolve_courier,
    "food_restaurant": _resolve_food_restaurant,
    "food_courier": _resolve_food_courier,
}


async def resolve_review_context(payload: Dict[str, Any], user: Dict[str, Any]) -> ReviewContext:
    transaction_id = str(payload.get("transaction_id") or payload.get("trip_id") or "")
    reviewee_id = str(payload.get("reviewee_id") or "")
    requested_type = payload.get("transaction_type")
    if requested_type:
        context = await _RESOLVERS[str(requested_type)](transaction_id, reviewee_id, user)
        if context:
            return context
        raise ValueError("Review transaction not found.")

    # Legacy clients do not send a transaction type. Preserve ride behavior while
    # keeping all new product flows explicit and unambiguous.
    for transaction_type in ("intercity", "hailing"):
        context = await _RESOLVERS[transaction_type](transaction_id, reviewee_id, user)
        if context:
            return context
    raise ValueError("Review transaction not found.")


async def review_transaction_completed(review: Dict[str, Any]) -> bool:
    transaction_id = review_transaction_id(review)
    transaction_type = review_transaction_type(review)
    if transaction_type == "intercity":
        from app.services.ride_service import TRIP_STATUS_COMPLETED, apply_ride_lifecycle, canonical_trip_status

        ride = await database.find_one("rides", {"id": transaction_id})
        if not ride:
            return False
        ride = await apply_ride_lifecycle(ride)
        return canonical_trip_status(ride.get("status")) == TRIP_STATUS_COMPLETED
    if transaction_type == "hailing":
        trip = await database.find_one("hailing_trips", {"id": transaction_id})
        return bool(trip and trip.get("status") == "COMPLETED")
    if transaction_type == "courier":
        delivery = await database.find_one("courier_deliveries", {"id": transaction_id})
        return bool(delivery and delivery.get("status") == "DELIVERED")
    if transaction_type in {"food_restaurant", "food_courier"}:
        order = await database.find_one("food_orders", {"id": transaction_id})
        return bool(order and (order.get("status") == "DELIVERED" or order.get("fulfillment_status") == "DELIVERED"))
    return False
