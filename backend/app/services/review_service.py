from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.database import database
from app.services.notification_service import create_app_notification, notify_admins
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


async def _has_review(trip_id: str, reviewer_id: str, reviewee_id: str) -> bool:
    existing = await database.find_many("reviews", {"trip_id": trip_id, "reviewer_id": reviewer_id})
    return any(review.get("reviewee_id") == reviewee_id for review in existing)


async def completed_trips_count_for_user(user_id: str, role: Optional[str] = None) -> int:
    from app.services.ride_service import TRIP_STATUS_COMPLETED, canonical_trip_status

    count = 0
    if role in (None, "driver"):
        rides = await database.find_many("rides", {"user_id": user_id})
        count += sum(1 for ride in rides if canonical_trip_status(ride.get("status")) == TRIP_STATUS_COMPLETED)

    if role in (None, "passenger"):
        requests = await database.find_many("ride_requests", {"user_id": user_id})
        for request in requests:
            if request.get("status") != "confirmed":
                continue
            ride = await database.find_one("rides", {"id": request.get("ride_id")})
            if ride and canonical_trip_status(ride.get("status")) == TRIP_STATUS_COMPLETED:
                count += 1
    return count


async def public_reviews_for_user(user_id: str, limit: int = SAFE_PUBLIC_REVIEW_LIMIT) -> List[Dict[str, Any]]:
    reviews = await database.find_many("reviews", {"reviewee_id": user_id})
    safe_reviews = await _completed_public_reviews(reviews)
    safe_reviews.sort(key=lambda item: item.get("created_at") or "", reverse=True)

    public: List[Dict[str, Any]] = []
    for review in safe_reviews[:limit]:
        reviewer = await database.find_one("users", {"id": review.get("reviewer_id")})
        public.append(
            {
                "id": review.get("id"),
                "trip_id": review.get("trip_id"),
                "reviewer_role": review.get("reviewer_role"),
                "reviewee_role": review.get("reviewee_role"),
                "reviewer_name": _public_display_name(reviewer),
                "rating": review.get("rating"),
                "category_ratings": review.get("category_ratings") or {},
                "comment": review.get("comment"),
                "created_at": review.get("created_at"),
            }
        )
    return public


async def public_review_summary_for_user(user_id: str, include_latest: bool = True) -> Dict[str, Any]:
    reviews = await database.find_many("reviews", {"reviewee_id": user_id})
    visible_reviews = await _completed_public_reviews(reviews)
    ratings = [float(review.get("rating")) for review in visible_reviews if review.get("rating")]
    average = round(sum(ratings) / len(ratings), 2) if ratings else None
    summary = {
        "average_rating": average,
        "review_count": len(ratings),
        "latest_reviews": await public_reviews_for_user(user_id) if include_latest else [],
        "completed_trips_count": await completed_trips_count_for_user(user_id),
    }
    return summary


async def _completed_public_reviews(reviews: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    from app.services.ride_service import TRIP_STATUS_COMPLETED, apply_ride_lifecycle, canonical_trip_status, is_public_ride

    visible_reviews: List[Dict[str, Any]] = []
    for review in reviews:
        if not _is_safe_public_review(review):
            continue
        ride = await database.find_one("rides", {"id": review.get("trip_id")})
        if not ride or not is_public_ride(ride):
            continue
        ride = await apply_ride_lifecycle(ride)
        if canonical_trip_status(ride.get("status")) == TRIP_STATUS_COMPLETED:
            visible_reviews.append(review)
    return visible_reviews


async def _recalculate_user_average(user_id: str) -> Dict[str, Any]:
    summary = await public_review_summary_for_user(user_id, include_latest=False)
    updates = {
        "rating": summary["average_rating"] or 0,
        "review_count": summary["review_count"],
        "updated_at": now_iso(),
    }
    await database.update_one("users", user_id, updates)
    driver = await database.find_one("drivers", {"user_id": user_id})
    if driver:
        await database.update_one("drivers", driver["id"], updates)
    return summary


async def _create_private_safety_report(review: Dict[str, Any], reviewer: Dict[str, Any], ride: Dict[str, Any]) -> Dict[str, Any]:
    timestamp = now_iso()
    report = {
        "id": new_id(),
        "user_id": reviewer["id"],
        "user_name": reviewer.get("name"),
        "user_email": reviewer.get("email"),
        "user_phone": reviewer.get("phone"),
        "report_type": "Safety issue from ride review",
        "message": review.get("comment") or "A low-rating ride review requested safety follow-up.",
        "ride_id": ride.get("id"),
        "review_id": review.get("id"),
        "reviewee_id": review.get("reviewee_id"),
        "status": "submitted",
        "private": True,
        "is_demo": False,
        "created_at": timestamp,
        "updated_at": timestamp,
    }
    created = await database.insert_one("reports", report)
    await notify_admins(
        "safety_report",
        "Safety report from ride review",
        "A private safety report from a completed ride review needs admin review.",
        {"report_id": created["id"], "review_id": review.get("id"), "ride_id": ride.get("id")},
    )
    return created


async def create_review(payload: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    from app.services.ride_service import TRIP_STATUS_COMPLETED, apply_ride_lifecycle, canonical_trip_status, is_public_ride

    ride = await database.find_one("rides", {"id": payload.get("trip_id")})
    if not ride or not is_public_ride(ride):
        raise ValueError("Ride not found.")
    ride = await apply_ride_lifecycle(ride)
    if canonical_trip_status(ride.get("status")) != TRIP_STATUS_COMPLETED:
        raise ValueError("Reviews unlock after a completed trip.")

    driver_user_id = ride.get("user_id")
    confirmed_requests = await _confirmed_requests_for_ride(ride["id"])
    confirmed_passenger_ids = {request.get("user_id") for request in confirmed_requests}
    reviewee_id = payload.get("reviewee_id")

    if user.get("id") == driver_user_id:
        reviewer_role = "driver"
        reviewee_role = "passenger"
        if reviewee_id not in confirmed_passenger_ids:
            raise PermissionError("Drivers can only review confirmed passengers on this trip.")
    elif user.get("id") in confirmed_passenger_ids:
        reviewer_role = "passenger"
        reviewee_role = "driver"
        if reviewee_id != driver_user_id:
            raise PermissionError("Passengers can only review the driver for this trip.")
    else:
        raise PermissionError("Only confirmed trip participants can leave reviews.")

    if await _has_review(ride["id"], user["id"], reviewee_id):
        raise ValueError("You already reviewed this person for this trip.")

    timestamp = now_iso()
    review = {
        "id": new_id(),
        "trip_id": ride["id"],
        "reviewer_id": user["id"],
        "reviewee_id": reviewee_id,
        "reviewer_role": reviewer_role,
        "reviewee_role": reviewee_role,
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
        report = await _create_private_safety_report(created, user, ride)
        created = await database.update_one(
            "reviews",
            created["id"],
            {"safety_report_id": report["id"], "updated_at": now_iso()},
        ) or created

    await _recalculate_user_average(reviewee_id)
    await create_app_notification(
        reviewee_id,
        "trip_review",
        "New trip review",
        "A completed-trip participant left you a review.",
        {"ride_id": ride["id"], "review_id": created["id"]},
    )
    return created


async def pending_reviews_for_user(user: Dict[str, Any]) -> List[Dict[str, Any]]:
    from app.services.ride_service import TRIP_STATUS_COMPLETED, apply_ride_lifecycle, canonical_trip_status, is_public_ride

    pending: List[Dict[str, Any]] = []

    driver_rides = await database.find_many("rides", {"user_id": user["id"]})
    for ride in driver_rides:
        if not is_public_ride(ride):
            continue
        lifecycle_ride = await apply_ride_lifecycle(ride)
        if canonical_trip_status(lifecycle_ride.get("status")) != TRIP_STATUS_COMPLETED:
            continue
        for request in await _confirmed_requests_for_ride(ride["id"]):
            passenger_id = request.get("user_id")
            if await _has_review(ride["id"], user["id"], passenger_id):
                continue
            passenger = await database.find_one("users", {"id": passenger_id})
            pending.append(
                {
                    "trip_id": ride["id"],
                    "reviewer_role": "driver",
                    "reviewee_id": passenger_id,
                    "reviewee_role": "passenger",
                    "reviewee_name": _public_display_name(passenger, request.get("passenger_name") or "Passenger"),
                    "ride_origin": ride.get("origin"),
                    "ride_destination": ride.get("destination"),
                    "completed_at": lifecycle_ride.get("completed_at"),
                }
            )

    passenger_requests = await database.find_many("ride_requests", {"user_id": user["id"]})
    for request in passenger_requests:
        if request.get("status") != "confirmed":
            continue
        ride = await database.find_one("rides", {"id": request.get("ride_id")})
        if not ride or not is_public_ride(ride):
            continue
        lifecycle_ride = await apply_ride_lifecycle(ride)
        if canonical_trip_status(lifecycle_ride.get("status")) != TRIP_STATUS_COMPLETED:
            continue
        driver_user_id = ride.get("user_id")
        if not driver_user_id or await _has_review(ride["id"], user["id"], driver_user_id):
            continue
        driver = await database.find_one("users", {"id": driver_user_id})
        pending.append(
            {
                "trip_id": ride["id"],
                "reviewer_role": "passenger",
                "reviewee_id": driver_user_id,
                "reviewee_role": "driver",
                "reviewee_name": _public_display_name(driver, ride.get("driver_name") or "Driver"),
                "ride_origin": ride.get("origin"),
                "ride_destination": ride.get("destination"),
                "completed_at": lifecycle_ride.get("completed_at"),
            }
        )

    return pending
