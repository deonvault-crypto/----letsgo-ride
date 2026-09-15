from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.database import database
from app.services.review_context_service import review_transaction_id, review_transaction_type


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


def _public_review_payload(review: Dict[str, Any], reviewer: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    transaction_id = review_transaction_id(review)
    transaction_type = review_transaction_type(review)
    return {
        "id": review.get("id"),
        "transaction_id": transaction_id,
        "transaction_type": transaction_type,
        "trip_id": transaction_id,
        "reviewer_role": review.get("reviewer_role"),
        "reviewee_role": review.get("reviewee_role"),
        "reviewer_name": _public_display_name(reviewer),
        "rating": review.get("rating"),
        "category_ratings": review.get("category_ratings") or {},
        "comment": review.get("comment"),
        "created_at": review.get("created_at"),
    }


async def _completed_transaction_keys(reviews: List[Dict[str, Any]]) -> set[tuple[str, str]]:
    from app.services.ride_service import TRIP_STATUS_COMPLETED, apply_ride_lifecycle, canonical_trip_status

    ids_by_type: Dict[str, set[str]] = {}
    for review in reviews:
        if not _is_safe_public_review(review):
            continue
        transaction_id = review_transaction_id(review)
        transaction_type = review_transaction_type(review)
        if transaction_id:
            ids_by_type.setdefault(transaction_type, set()).add(transaction_id)

    completed: set[tuple[str, str]] = set()

    intercity_ids = ids_by_type.get("intercity", set())
    if intercity_ids:
        rides = await database.find_many("rides", {"id": {"$in": sorted(intercity_ids)}})
        for ride in rides:
            lifecycle_ride = await apply_ride_lifecycle(ride)
            if canonical_trip_status(lifecycle_ride.get("status")) == TRIP_STATUS_COMPLETED:
                completed.add(("intercity", str(lifecycle_ride.get("id") or "")))

    hailing_ids = ids_by_type.get("hailing", set())
    if hailing_ids:
        trips = await database.find_many(
            "hailing_trips",
            {"id": {"$in": sorted(hailing_ids)}, "status": "COMPLETED"},
        )
        completed.update(("hailing", str(trip.get("id") or "")) for trip in trips if trip.get("id"))

    courier_ids = ids_by_type.get("courier", set())
    if courier_ids:
        deliveries = await database.find_many(
            "courier_deliveries",
            {"id": {"$in": sorted(courier_ids)}, "status": "DELIVERED"},
        )
        completed.update(("courier", str(item.get("id") or "")) for item in deliveries if item.get("id"))

    food_ids = ids_by_type.get("food_restaurant", set()) | ids_by_type.get("food_courier", set())
    if food_ids:
        orders = await database.find_many("food_orders", {"id": {"$in": sorted(food_ids)}})
        delivered_ids = {
            str(order.get("id") or "")
            for order in orders
            if order.get("id") and (order.get("status") == "DELIVERED" or order.get("fulfillment_status") == "DELIVERED")
        }
        for transaction_type in ("food_restaurant", "food_courier"):
            for transaction_id in ids_by_type.get(transaction_type, set()):
                if transaction_id in delivered_ids:
                    completed.add((transaction_type, transaction_id))

    return completed


async def _visible_completed_reviews(reviews: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    completed = await _completed_transaction_keys(reviews)
    return [
        review
        for review in reviews
        if _is_safe_public_review(review)
        and (review_transaction_type(review), review_transaction_id(review)) in completed
    ]


async def _public_latest(reviews: List[Dict[str, Any]], limit: int = SAFE_PUBLIC_REVIEW_LIMIT) -> List[Dict[str, Any]]:
    latest = sorted(reviews, key=lambda item: item.get("created_at") or "", reverse=True)[:limit]
    reviewer_ids = sorted({str(review.get("reviewer_id") or "") for review in latest if review.get("reviewer_id")})
    reviewers = await database.find_many("users", {"id": {"$in": reviewer_ids}}) if reviewer_ids else []
    reviewers_by_id = {str(user.get("id") or ""): user for user in reviewers}
    return [
        _public_review_payload(review, reviewers_by_id.get(str(review.get("reviewer_id") or "")))
        for review in latest
    ]


async def completed_trips_count_for_user(user_id: str, role: Optional[str] = None) -> int:
    from app.services.ride_service import TRIP_STATUS_COMPLETED, canonical_trip_status

    count = 0
    if role in (None, "driver"):
        rides = await database.find_many("rides", {"user_id": user_id})
        count += sum(1 for ride in rides if canonical_trip_status(ride.get("status")) == TRIP_STATUS_COMPLETED)
        count += await database.count("hailing_trips", {"driver_user_id": user_id, "status": "COMPLETED"})

    if role in (None, "passenger", "customer"):
        requests = await database.find_many("ride_requests", {"user_id": user_id, "status": "confirmed"})
        ride_ids = sorted({str(request.get("ride_id") or "") for request in requests if request.get("ride_id")})
        rides = await database.find_many("rides", {"id": {"$in": ride_ids}}) if ride_ids else []
        completed_ride_ids = {
            str(ride.get("id") or "")
            for ride in rides
            if canonical_trip_status(ride.get("status")) == TRIP_STATUS_COMPLETED
        }
        count += sum(1 for request in requests if str(request.get("ride_id") or "") in completed_ride_ids)
        count += await database.count("hailing_trips", {"passenger_user_id": user_id, "status": "COMPLETED"})

    if role in (None, "courier"):
        count += await database.count("courier_deliveries", {"courier_user_id": user_id, "status": "DELIVERED"})
    return count


async def public_review_summary_for_user(user_id: str, include_latest: bool = True) -> Dict[str, Any]:
    reviews = await database.find_many(
        "reviews",
        {"reviewee_id": user_id, "reviewee_kind": {"$in": [None, "user"]}},
    )
    visible = await _visible_completed_reviews(reviews)
    ratings = [float(review.get("rating")) for review in visible if isinstance(review.get("rating"), (int, float))]
    average = round(sum(ratings) / len(ratings), 2) if ratings else None
    return {
        "average_rating": average,
        "review_count": len(ratings),
        "latest_reviews": await _public_latest(visible) if include_latest else [],
        "completed_trips_count": await completed_trips_count_for_user(user_id),
    }


async def public_review_summary_for_restaurant(restaurant_id: str, include_latest: bool = True) -> Dict[str, Any]:
    restaurant = await database.find_one("restaurants", {"id": restaurant_id})
    if not restaurant:
        raise ValueError("Restaurant not found.")
    reviews = await database.find_many(
        "reviews",
        {"reviewee_id": restaurant_id, "reviewee_kind": "restaurant"},
    )
    visible = await _visible_completed_reviews(reviews)
    ratings = [float(review.get("rating")) for review in visible if isinstance(review.get("rating"), (int, float))]
    average = round(sum(ratings) / len(ratings), 2) if ratings else None
    return {
        "average_rating": average,
        "review_count": len(ratings),
        "latest_reviews": await _public_latest(visible) if include_latest else [],
    }
