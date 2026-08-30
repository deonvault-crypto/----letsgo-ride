from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.database import database
from app.services.notification_service import create_app_notification, notify_admins
from app.services.review_context_service import (
    ReviewContext,
    resolve_review_context,
    review_transaction_completed,
    review_transaction_id,
    review_transaction_type,
)
from app.utils import new_id, now_iso


SAFE_PUBLIC_REVIEW_LIMIT = 5


def _public_display_name(user: Optional[Dict[str, Any]], fallback: str = "LetsGoRide member") -> str:
    if not user:
        return fallback
    raw_name = str(user.get("name") or fallback).strip()
    parts = [part for part in raw_name.split() if part]
    if len(parts) >= 2:
        return f"{parts[0]} {parts[1][0]}."
    return raw_name or fallback


def _is_safe_public_review(review: Dict[str, Any]) -> bool:
    return not any(
        [
            review.get("hidden"),
            review.get("under_investigation"),
            review.get("safety_report_requested"),
            review.get("safety_report_id"),
        ]
    )


async def _confirmed_requests_for_ride(ride_id: str) -> List[Dict[str, Any]]:
    requests = await database.find_many("ride_requests", {"ride_id": ride_id})
    return [request for request in requests if request.get("status") == "confirmed" and request.get("user_id")]


async def _has_review(transaction_id: str, transaction_type: str, reviewer_id: str, reviewee_id: str) -> bool:
    candidates = await database.find_many("reviews", {"reviewer_id": reviewer_id, "reviewee_id": reviewee_id})
    return any(
        review_transaction_id(review) == transaction_id
        and review_transaction_type(review) == transaction_type
        for review in candidates
    )


async def completed_trips_count_for_user(user_id: str, role: Optional[str] = None) -> int:
    from app.services.ride_service import TRIP_STATUS_COMPLETED, canonical_trip_status

    count = 0
    if role in (None, "driver"):
        rides = await database.find_many("rides", {"user_id": user_id})
        count += sum(1 for ride in rides if canonical_trip_status(ride.get("status")) == TRIP_STATUS_COMPLETED)
        count += len(await database.find_many("hailing_trips", {"driver_user_id": user_id, "status": "COMPLETED"}))

    if role in (None, "passenger", "customer"):
        requests = await database.find_many("ride_requests", {"user_id": user_id})
        for request in requests:
            if request.get("status") != "confirmed":
                continue
            ride = await database.find_one("rides", {"id": request.get("ride_id")})
            if ride and canonical_trip_status(ride.get("status")) == TRIP_STATUS_COMPLETED:
                count += 1
        count += len(await database.find_many("hailing_trips", {"passenger_user_id": user_id, "status": "COMPLETED"}))

    if role in (None, "courier"):
        count += len(await database.find_many("courier_deliveries", {"courier_user_id": user_id, "status": "DELIVERED"}))
    return count


async def _completed_public_reviews(reviews: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    visible_reviews: List[Dict[str, Any]] = []
    for review in reviews:
        if not _is_safe_public_review(review):
            continue
        if await review_transaction_completed(review):
            visible_reviews.append(review)
    return visible_reviews


def _public_review_payload(review: Dict[str, Any], reviewer: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    transaction_id = review_transaction_id(review)
    transaction_type = review_transaction_type(review)
    return {
        "id": review.get("id"),
        "transaction_id": transaction_id,
        "transaction_type": transaction_type,
        # Keep this one response alias while old mobile builds still read it.
        "trip_id": transaction_id,
        "reviewer_role": review.get("reviewer_role"),
        "reviewee_role": review.get("reviewee_role"),
        "reviewer_name": _public_display_name(reviewer),
        "rating": review.get("rating"),
        "category_ratings": review.get("category_ratings") or {},
        "comment": review.get("comment"),
        "created_at": review.get("created_at"),
    }


async def public_reviews_for_user(user_id: str, limit: int = SAFE_PUBLIC_REVIEW_LIMIT) -> List[Dict[str, Any]]:
    reviews = await database.find_many("reviews", {"reviewee_id": user_id})
    reviews = [review for review in reviews if review.get("reviewee_kind") in {None, "user"}]
    safe_reviews = await _completed_public_reviews(reviews)
    safe_reviews.sort(key=lambda item: item.get("created_at") or "", reverse=True)

    public: List[Dict[str, Any]] = []
    for review in safe_reviews[:limit]:
        reviewer = await database.find_one("users", {"id": review.get("reviewer_id")})
        public.append(_public_review_payload(review, reviewer))
    return public


async def public_review_summary_for_user(user_id: str, include_latest: bool = True) -> Dict[str, Any]:
    reviews = await database.find_many("reviews", {"reviewee_id": user_id})
    reviews = [review for review in reviews if review.get("reviewee_kind") in {None, "user"}]
    visible_reviews = await _completed_public_reviews(reviews)
    ratings = [float(review.get("rating")) for review in visible_reviews if isinstance(review.get("rating"), (int, float))]
    average = round(sum(ratings) / len(ratings), 2) if ratings else None
    return {
        "average_rating": average,
        "review_count": len(ratings),
        "latest_reviews": await public_reviews_for_user(user_id) if include_latest else [],
        "completed_trips_count": await completed_trips_count_for_user(user_id),
    }


async def public_reviews_for_restaurant(restaurant_id: str, limit: int = SAFE_PUBLIC_REVIEW_LIMIT) -> List[Dict[str, Any]]:
    reviews = await database.find_many("reviews", {"reviewee_id": restaurant_id, "reviewee_kind": "restaurant"})
    safe_reviews = await _completed_public_reviews(reviews)
    safe_reviews.sort(key=lambda item: item.get("created_at") or "", reverse=True)
    public = []
    for review in safe_reviews[:limit]:
        reviewer = await database.find_one("users", {"id": review.get("reviewer_id")})
        public.append(_public_review_payload(review, reviewer))
    return public


async def public_review_summary_for_restaurant(restaurant_id: str, include_latest: bool = True) -> Dict[str, Any]:
    restaurant = await database.find_one("restaurants", {"id": restaurant_id})
    if not restaurant:
        raise ValueError("Restaurant not found.")
    reviews = await database.find_many("reviews", {"reviewee_id": restaurant_id, "reviewee_kind": "restaurant"})
    visible = await _completed_public_reviews(reviews)
    ratings = [float(review.get("rating")) for review in visible if isinstance(review.get("rating"), (int, float))]
    average = round(sum(ratings) / len(ratings), 2) if ratings else None
    return {
        "average_rating": average,
        "review_count": len(ratings),
        "latest_reviews": await public_reviews_for_restaurant(restaurant_id) if include_latest else [],
    }


async def _recalculate_target_average(context: ReviewContext) -> Dict[str, Any]:
    timestamp = now_iso()
    if context.reviewee_kind == "restaurant":
        summary = await public_review_summary_for_restaurant(context.reviewee_id, include_latest=False)
        updates = {
            "rating": summary["average_rating"],
            "review_count": summary["review_count"],
            "updated_at": timestamp,
        }
        await database.update_one("restaurants", context.reviewee_id, updates)
        return summary

    summary = await public_review_summary_for_user(context.reviewee_id, include_latest=False)
    updates = {
        # New workers with zero reviews remain unrated instead of looking like 0.0 stars.
        "rating": summary["average_rating"],
        "review_count": summary["review_count"],
        "updated_at": timestamp,
    }
    await database.update_one("users", context.reviewee_id, updates)
    driver = await database.find_one("drivers", {"user_id": context.reviewee_id})
    if driver:
        await database.update_one("drivers", driver["id"], updates)
    courier = await database.find_one("courier_profiles", {"user_id": context.reviewee_id})
    if courier:
        await database.update_one("courier_profiles", courier["id"], updates)
    return summary


async def _create_private_safety_report(review: Dict[str, Any], reviewer: Dict[str, Any], context: ReviewContext) -> Dict[str, Any]:
    timestamp = now_iso()
    report = {
        "id": new_id(),
        "user_id": reviewer["id"],
        "user_name": reviewer.get("name"),
        "user_email": reviewer.get("email"),
        "user_phone": reviewer.get("phone"),
        "report_type": f"Safety issue from {context.transaction_type} review",
        "message": review.get("comment") or "A completed transaction review requested safety follow-up.",
        "review_transaction_id": context.transaction_id,
        "review_transaction_type": context.transaction_type,
        "review_id": review.get("id"),
        "reviewee_id": context.reviewee_id,
        "status": "submitted",
        "private": True,
        "is_demo": False,
        "created_at": timestamp,
        "updated_at": timestamp,
    }
    if context.transaction_type == "intercity":
        report["ride_id"] = context.transaction_id
    elif context.transaction_type == "hailing":
        report["hailing_trip_id"] = context.transaction_id
    elif context.transaction_type == "courier":
        report["delivery_id"] = context.transaction_id

    created = await database.insert_one("reports", report)
    await notify_admins(
        "safety_report",
        "Safety report from completed review",
        "A private review safety report needs admin review.",
        {
            "report_id": created["id"],
            "review_id": review.get("id"),
            "transaction_id": context.transaction_id,
            "transaction_type": context.transaction_type,
        },
    )
    return created


async def _notify_review_target(context: ReviewContext, review_id: str) -> None:
    if context.reviewee_kind == "user":
        await create_app_notification(
            context.reviewee_id,
            "trip_review",
            "New review",
            "A completed LetsGoRide transaction participant left you a review.",
            {**context.notification_data, "review_id": review_id},
        )
        return
    restaurant = await database.find_one("restaurants", {"id": context.reviewee_id})
    owner_user_id = str((restaurant or {}).get("owner_user_id") or "")
    if owner_user_id:
        await create_app_notification(
            owner_user_id,
            "trip_review",
            "New restaurant review",
            "A delivered food order received a new customer review.",
            {**context.notification_data, "review_id": review_id},
        )


async def create_review(payload: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    context = await resolve_review_context(payload, user)
    if await _has_review(context.transaction_id, context.transaction_type, user["id"], context.reviewee_id):
        raise ValueError("You already reviewed this person or business for this transaction.")

    timestamp = now_iso()
    review = {
        "id": new_id(),
        "transaction_id": context.transaction_id,
        "transaction_type": context.transaction_type,
        "reviewer_id": user["id"],
        "reviewee_id": context.reviewee_id,
        "reviewer_role": context.reviewer_role,
        "reviewee_role": context.reviewee_role,
        "reviewee_kind": context.reviewee_kind,
        "rating": int(payload.get("rating")),
        "category_ratings": payload.get("category_ratings") or {},
        "comment": payload.get("comment"),
        "safety_report_requested": bool(payload.get("safety_report_requested")),
        "under_investigation": bool(payload.get("safety_report_requested")),
        "created_at": timestamp,
        "updated_at": timestamp,
    }
    created = await database.insert_one("reviews", review)

    if created["safety_report_requested"]:
        if context.reviewee_kind != "user":
            raise ValueError("Safety follow-up is available for reviews of people, not restaurant quality reviews.")
        report = await _create_private_safety_report(created, user, context)
        created = await database.update_one(
            "reviews",
            created["id"],
            {"safety_report_id": report["id"], "updated_at": now_iso()},
        ) or created

    await _recalculate_target_average(context)
    await _notify_review_target(context, created["id"])
    return created


def _pending_payload(
    *,
    transaction_id: str,
    transaction_type: str,
    reviewer_role: str,
    reviewee_id: str,
    reviewee_role: str,
    reviewee_name: str,
    completed_at: Any,
    origin: Any = None,
    destination: Any = None,
) -> Dict[str, Any]:
    category_keys = {
        "driver": ["safety", "punctuality", "communication", "vehicle_cleanliness"],
        "passenger": ["communication", "respectful_behavior", "payment_reliability"],
        "courier": ["delivery_time", "communication", "package_handling", "professionalism"],
        "restaurant": ["food_quality", "order_accuracy", "packaging"],
    }.get(reviewee_role, ["communication"])
    return {
        "transaction_id": transaction_id,
        "transaction_type": transaction_type,
        "trip_id": transaction_id,
        "reviewer_role": reviewer_role,
        "reviewee_id": reviewee_id,
        "reviewee_role": reviewee_role,
        "reviewee_name": reviewee_name,
        "category_keys": category_keys,
        "ride_origin": origin,
        "ride_destination": destination,
        "completed_at": completed_at,
    }


async def pending_reviews_for_user(user: Dict[str, Any]) -> List[Dict[str, Any]]:
    from app.services.ride_service import TRIP_STATUS_COMPLETED, apply_ride_lifecycle, canonical_trip_status, is_public_ride

    user_id = str(user.get("id") or "")
    pending: List[Dict[str, Any]] = []

    driver_rides = await database.find_many("rides", {"user_id": user_id})
    for ride in driver_rides:
        if not is_public_ride(ride):
            continue
        lifecycle_ride = await apply_ride_lifecycle(ride)
        if canonical_trip_status(lifecycle_ride.get("status")) != TRIP_STATUS_COMPLETED:
            continue
        for request in await _confirmed_requests_for_ride(ride["id"]):
            passenger_id = str(request.get("user_id") or "")
            if not passenger_id or await _has_review(ride["id"], "intercity", user_id, passenger_id):
                continue
            passenger = await database.find_one("users", {"id": passenger_id})
            pending.append(
                _pending_payload(
                    transaction_id=ride["id"],
                    transaction_type="intercity",
                    reviewer_role="driver",
                    reviewee_id=passenger_id,
                    reviewee_role="passenger",
                    reviewee_name=_public_display_name(passenger, request.get("passenger_name") or "Passenger"),
                    origin=ride.get("origin"),
                    destination=ride.get("destination"),
                    completed_at=lifecycle_ride.get("completed_at"),
                )
            )

    passenger_requests = await database.find_many("ride_requests", {"user_id": user_id})
    for request in passenger_requests:
        if request.get("status") != "confirmed":
            continue
        ride = await database.find_one("rides", {"id": request.get("ride_id")})
        if not ride or not is_public_ride(ride):
            continue
        lifecycle_ride = await apply_ride_lifecycle(ride)
        if canonical_trip_status(lifecycle_ride.get("status")) != TRIP_STATUS_COMPLETED:
            continue
        driver_user_id = str(ride.get("user_id") or "")
        if not driver_user_id or await _has_review(ride["id"], "intercity", user_id, driver_user_id):
            continue
        driver = await database.find_one("users", {"id": driver_user_id})
        pending.append(
            _pending_payload(
                transaction_id=ride["id"],
                transaction_type="intercity",
                reviewer_role="passenger",
                reviewee_id=driver_user_id,
                reviewee_role="driver",
                reviewee_name=_public_display_name(driver, ride.get("driver_name") or "Driver"),
                origin=ride.get("origin"),
                destination=ride.get("destination"),
                completed_at=lifecycle_ride.get("completed_at"),
            )
        )

    hailing_driver_trips = await database.find_many("hailing_trips", {"driver_user_id": user_id, "status": "COMPLETED"})
    for trip in hailing_driver_trips:
        passenger_id = str(trip.get("passenger_user_id") or "")
        if not passenger_id or await _has_review(trip["id"], "hailing", user_id, passenger_id):
            continue
        passenger = await database.find_one("users", {"id": passenger_id})
        pending.append(
            _pending_payload(
                transaction_id=trip["id"],
                transaction_type="hailing",
                reviewer_role="driver",
                reviewee_id=passenger_id,
                reviewee_role="passenger",
                reviewee_name=_public_display_name(passenger, (trip.get("passenger_snapshot") or {}).get("name") or "Passenger"),
                origin=(trip.get("pickup") or {}).get("formatted_address"),
                destination=(trip.get("dropoff") or {}).get("formatted_address"),
                completed_at=trip.get("completed_at"),
            )
        )

    hailing_passenger_trips = await database.find_many("hailing_trips", {"passenger_user_id": user_id, "status": "COMPLETED"})
    for trip in hailing_passenger_trips:
        driver_user_id = str(trip.get("driver_user_id") or "")
        if not driver_user_id or await _has_review(trip["id"], "hailing", user_id, driver_user_id):
            continue
        driver = await database.find_one("users", {"id": driver_user_id})
        pending.append(
            _pending_payload(
                transaction_id=trip["id"],
                transaction_type="hailing",
                reviewer_role="passenger",
                reviewee_id=driver_user_id,
                reviewee_role="driver",
                reviewee_name=_public_display_name(driver, (trip.get("driver_snapshot") or {}).get("name") or "Driver"),
                origin=(trip.get("pickup") or {}).get("formatted_address"),
                destination=(trip.get("dropoff") or {}).get("formatted_address"),
                completed_at=trip.get("completed_at"),
            )
        )

    customer_deliveries = await database.find_many("courier_deliveries", {"sender_user_id": user_id, "status": "DELIVERED"})
    for delivery in customer_deliveries:
        # Food deliveries are reviewed from their food order so restaurant + courier
        # stay together and customers are not prompted twice for the same courier.
        if delivery.get("source_type") == "FOOD_ORDER":
            continue
        courier_user_id = str(delivery.get("courier_user_id") or "")
        if not courier_user_id or await _has_review(delivery["id"], "courier", user_id, courier_user_id):
            continue
        courier = await database.find_one("users", {"id": courier_user_id})
        pending.append(
            _pending_payload(
                transaction_id=delivery["id"],
                transaction_type="courier",
                reviewer_role="customer",
                reviewee_id=courier_user_id,
                reviewee_role="courier",
                reviewee_name=_public_display_name(courier, delivery.get("courier_name") or "Courier"),
                origin=delivery.get("pickup_address"),
                destination=delivery.get("dropoff_address"),
                completed_at=delivery.get("delivered_at"),
            )
        )

    orders = await database.find_many("food_orders", {"customer_user_id": user_id})
    for order in orders:
        if order.get("status") != "DELIVERED" and order.get("fulfillment_status") != "DELIVERED":
            continue
        restaurant_id = str(order.get("restaurant_id") or "")
        if restaurant_id and not await _has_review(order["id"], "food_restaurant", user_id, restaurant_id):
            pending.append(
                _pending_payload(
                    transaction_id=order["id"],
                    transaction_type="food_restaurant",
                    reviewer_role="customer",
                    reviewee_id=restaurant_id,
                    reviewee_role="restaurant",
                    reviewee_name=str(order.get("restaurant_name") or "Restaurant"),
                    completed_at=order.get("delivered_at") or order.get("updated_at"),
                )
            )
        delivery_id = str(order.get("courier_delivery_id") or "")
        delivery = await database.find_one("courier_deliveries", {"id": delivery_id}) if delivery_id else None
        courier_user_id = str((delivery or {}).get("courier_user_id") or "")
        if courier_user_id and not await _has_review(order["id"], "food_courier", user_id, courier_user_id):
            courier = await database.find_one("users", {"id": courier_user_id})
            pending.append(
                _pending_payload(
                    transaction_id=order["id"],
                    transaction_type="food_courier",
                    reviewer_role="customer",
                    reviewee_id=courier_user_id,
                    reviewee_role="courier",
                    reviewee_name=_public_display_name(courier, (delivery or {}).get("courier_name") or "Courier"),
                    completed_at=order.get("delivered_at") or order.get("updated_at"),
                )
            )

    pending.sort(key=lambda item: str(item.get("completed_at") or ""), reverse=True)
    return pending
