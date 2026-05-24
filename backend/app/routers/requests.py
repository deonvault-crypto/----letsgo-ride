from fastapi import APIRouter, Depends

from app.auth import get_current_user
from app.database import database
from app.models.request import RideRequestCreateBody, RideRequestUpdateBody
from app.services.audit_service import write_audit_log
from app.services.conversation_service import ensure_conversation_for_request
from app.services.notification_service import create_app_notification
from app.services.ride_service import enrich_ride, is_public_ride
from app.utils import api_error, api_success, new_id, now_iso


router = APIRouter(prefix="/requests", tags=["requests"])
ACTIVE_REQUEST_STATUSES = {"pending", "confirmed"}


async def _driver_owns_ride(user, ride) -> bool:
    return bool(ride and ride.get("user_id") == user.get("id"))


async def _load_request_and_ride(request_id: str):
    existing = await database.find_one("ride_requests", {"id": request_id})
    if not existing:
        api_error("Ride request not found.", 404)
    ride = await database.find_one("rides", {"id": existing.get("ride_id")})
    if not ride:
        api_error("Ride not found.", 404)
    return existing, ride


async def _create_request_notification(request, ride):
    await create_app_notification(
        ride.get("user_id"),
        "booking_request",
        "New seat request",
        f"{request.get('passenger_name') or 'A passenger'} requested a seat for {ride.get('origin')} to {ride.get('destination')}.",
        {"ride_id": ride.get("id"), "request_id": request.get("id")},
    )


async def _accept_request(existing, ride, user):
    if not await _driver_owns_ride(user, ride):
        api_error("Only the driver can accept this passenger request.", 403)
    if not user.get("phone"):
        api_error("Add your phone number before accepting a passenger request.")
    if existing.get("status") != "pending":
        api_error("Only pending requests can be accepted.", 400)
    requested_seats = int(existing.get("seats", 1))
    available_seats = int(ride.get("available_seats", 0))
    if requested_seats > available_seats:
        api_error("Not enough seats available.", 400)

    timestamp = now_iso()
    updated_request = await database.update_one(
        "ride_requests",
        existing["id"],
        {"status": "confirmed", "updated_at": timestamp},
    )
    await database.update_one(
        "rides",
        ride["id"],
        {"available_seats": max(0, available_seats - requested_seats), "updated_at": timestamp},
    )
    await ensure_conversation_for_request(updated_request or existing, ride)
    await create_app_notification(
        existing.get("user_id"),
        "booking_confirmed",
        "Ride request accepted",
        f"Your request for {ride.get('origin')} to {ride.get('destination')} was accepted.",
        {"ride_id": ride.get("id"), "request_id": existing.get("id")},
    )
    await write_audit_log(
        actor_user_id=user["id"],
        actor_role=user.get("role"),
        action="driver_request_accepted",
        target_type="ride_request",
        target_id=existing["id"],
        metadata={"ride_id": ride["id"], "seats": requested_seats},
    )
    return updated_request or existing


async def _decline_request(existing, ride, user, reason=None):
    if not await _driver_owns_ride(user, ride):
        api_error("Only the driver can decline this passenger request.", 403)
    if existing.get("status") != "pending":
        api_error("Only pending requests can be declined.", 400)
    timestamp = now_iso()
    updates = {"status": "declined", "updated_at": timestamp}
    if reason:
        updates["driver_decision_reason"] = reason
    updated_request = await database.update_one("ride_requests", existing["id"], updates)
    await create_app_notification(
        existing.get("user_id"),
        "booking_declined",
        "Ride request declined",
        f"Your request for {ride.get('origin')} to {ride.get('destination')} was declined.",
        {"ride_id": ride.get("id"), "request_id": existing.get("id")},
    )
    return updated_request or existing


async def _cancel_by_passenger(existing, ride, user, reason=None):
    if existing.get("user_id") != user.get("id"):
        api_error("You can only cancel your own ride requests.", 403)
    if existing.get("status") not in {"pending", "confirmed"}:
        api_error("This booking cannot be cancelled.", 400)
    timestamp = now_iso()
    if existing.get("status") == "confirmed":
        await database.update_one(
            "rides",
            ride["id"],
            {"available_seats": int(ride.get("available_seats", 0)) + int(existing.get("seats", 1)), "updated_at": timestamp},
        )
    updates = {"status": "cancelled_by_passenger", "updated_at": timestamp}
    if reason:
        updates["cancellation_reason"] = reason
    updated_request = await database.update_one("ride_requests", existing["id"], updates)
    await create_app_notification(
        ride.get("user_id"),
        "booking_cancelled",
        "Passenger cancelled booking",
        f"{existing.get('passenger_name') or 'A passenger'} cancelled a booking for {ride.get('origin')} to {ride.get('destination')}.",
        {"ride_id": ride.get("id"), "request_id": existing.get("id")},
    )
    return updated_request or existing


async def _cancel_by_driver(existing, ride, user, reason=None):
    if not await _driver_owns_ride(user, ride):
        api_error("Only the driver can cancel this passenger booking.", 403)
    if not reason or not reason.strip():
        api_error("Cancellation reason is required.", 400)
    if existing.get("status") not in {"pending", "confirmed"}:
        api_error("This booking cannot be cancelled.", 400)
    timestamp = now_iso()
    if existing.get("status") == "confirmed":
        await database.update_one(
            "rides",
            ride["id"],
            {"available_seats": int(ride.get("available_seats", 0)) + int(existing.get("seats", 1)), "updated_at": timestamp},
        )
    updated_request = await database.update_one(
        "ride_requests",
        existing["id"],
        {"status": "cancelled_by_driver", "driver_cancellation_reason": reason, "updated_at": timestamp},
    )
    await create_app_notification(
        existing.get("user_id"),
        "booking_cancelled",
        "Driver cancelled booking",
        f"Your booking for {ride.get('origin')} to {ride.get('destination')} was cancelled by the driver.",
        {"ride_id": ride.get("id"), "request_id": existing.get("id")},
    )
    return updated_request or existing


@router.post("")
async def create_request(payload: RideRequestCreateBody, user=Depends(get_current_user)):
    if not user.get("phone"):
        api_error("Add your phone number before booking a seat.")
    ride = await database.find_one("rides", {"id": payload.ride_id})
    if not ride or not is_public_ride(ride):
        api_error("Ride not found.", 404)
    if ride.get("user_id") == user.get("id"):
        api_error("You cannot request a seat on your own ride.", 403)
    if ride.get("status", "open") != "open":
        api_error("This ride is not accepting requests.", 400)
    if payload.seats > int(ride.get("available_seats", 0)):
        api_error("Not enough seats available.", 400)

    existing_requests = await database.find_many("ride_requests", {"ride_id": payload.ride_id})
    for request in existing_requests:
        if request.get("user_id") == user["id"] and request.get("status") in ACTIVE_REQUEST_STATUSES:
            api_error("You already have an active request for this ride.", 400)

    timestamp = now_iso()
    ride_snapshot = await enrich_ride(ride, user)
    request = {
        "id": new_id(),
        "status": "pending",
        "user_id": user["id"],
        "ride_snapshot": ride_snapshot,
        "is_demo": False,
        "created_at": timestamp,
        "updated_at": timestamp,
        **payload.model_dump(),
        "passenger_name": payload.passenger_name or user.get("name") or "Passenger",
        "passenger_phone": payload.passenger_phone or user.get("phone"),
        "passenger_profile_photo_url": user.get("profile_photo_url"),
        "passenger_verification_status": user.get("verification_status"),
    }
    created = await database.insert_one("ride_requests", request)
    await ensure_conversation_for_request(created, ride)
    await _create_request_notification(created, ride)
    return api_success(created)


@router.get("/my")
async def my_requests(user=Depends(get_current_user)):
    return api_success(await database.find_many("ride_requests", {"user_id": user["id"]}))


@router.get("/driver")
async def driver_requests(user=Depends(get_current_user)):
    rides = await database.find_many("rides", {"user_id": user["id"]})
    ride_ids = {ride["id"] for ride in rides}
    requests = await database.find_many("ride_requests")
    return api_success([request for request in requests if request.get("ride_id") in ride_ids and request.get("user_id") != user["id"]])


@router.patch("/{request_id}")
async def update_request(request_id: str, payload: RideRequestUpdateBody, user=Depends(get_current_user)):
    existing, ride = await _load_request_and_ride(request_id)
    if payload.status == "confirmed":
        return api_success(await _accept_request(existing, ride, user))
    if payload.status == "declined":
        return api_success(await _decline_request(existing, ride, user, payload.reason))
    if payload.status in {"cancelled", "cancelled_by_passenger"}:
        return api_success(await _cancel_by_passenger(existing, ride, user, payload.reason))
    if payload.status == "cancelled_by_driver":
        return api_success(await _cancel_by_driver(existing, ride, user, payload.reason))
    if payload.status == "cancelled_by_admin" and user.get("role") == "admin":
        updated = await database.update_one("ride_requests", request_id, {"status": "cancelled_by_admin", "updated_at": now_iso()})
        return api_success(updated)
    api_error("Unsupported request status update.", 400)


@router.post("/{request_id}/accept")
async def accept_request(request_id: str, user=Depends(get_current_user)):
    existing, ride = await _load_request_and_ride(request_id)
    return api_success(await _accept_request(existing, ride, user))


@router.post("/{request_id}/decline")
async def decline_request(request_id: str, payload: RideRequestUpdateBody, user=Depends(get_current_user)):
    existing, ride = await _load_request_and_ride(request_id)
    return api_success(await _decline_request(existing, ride, user, payload.reason))


@router.post("/{request_id}/cancel")
async def cancel_request(request_id: str, payload: RideRequestUpdateBody | None = None, user=Depends(get_current_user)):
    existing, ride = await _load_request_and_ride(request_id)
    return api_success(await _cancel_by_passenger(existing, ride, user, payload.reason if payload else None))


@router.post("/{request_id}/cancel-passenger")
async def cancel_passenger(request_id: str, payload: RideRequestUpdateBody, user=Depends(get_current_user)):
    existing, ride = await _load_request_and_ride(request_id)
    return api_success(await _cancel_by_driver(existing, ride, user, payload.reason))


@router.delete("/{request_id}")
async def delete_request(request_id: str, user=Depends(get_current_user)):
    existing, ride = await _load_request_and_ride(request_id)
    if existing.get("user_id") != user.get("id") and not await _driver_owns_ride(user, ride) and user.get("role") != "admin":
        api_error("You can only delete requests connected to your account.", 403)
    deleted = await database.delete_one("ride_requests", request_id)
    if not deleted:
        api_error("Ride request not found.", 404)
    return api_success({"deleted": True})
