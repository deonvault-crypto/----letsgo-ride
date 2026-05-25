from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.auth import get_current_user, get_optional_current_user
from app.database import database
from app.models.ride import LiveLocationBody, RideCreateBody, RideUpdateBody
from app.services.ride_service import (
    create_ride,
    disable_live_location,
    end_trip,
    enrich_ride,
    apply_ride_lifecycle,
    is_final_trip_status,
    is_public_ride,
    live_trip_state,
    list_public_rides,
    list_user_rides,
    search_rides,
    start_trip,
    update_live_location,
)
from app.utils import api_error, api_success, now_iso


router = APIRouter(prefix="/rides", tags=["rides"])


@router.get("")
async def list_rides(user=Depends(get_optional_current_user)):
    return api_success(await list_public_rides(user))


@router.get("/search")
async def search(
    origin: Optional[str] = None,
    destination: Optional[str] = None,
    date: Optional[str] = None,
    seats: int = Query(default=1, ge=1),
    user=Depends(get_optional_current_user),
):
    return api_success(await search_rides(origin, destination, seats, date, user))


@router.get("/my")
async def my_rides(user=Depends(get_current_user)):
    return api_success(await list_user_rides(user))


@router.get("/{ride_id}")
async def ride_detail(ride_id: str, user=Depends(get_optional_current_user)):
    ride = await database.find_one("rides", {"id": ride_id})
    if not ride or not is_public_ride(ride):
        api_error("Ride not found.", 404)
    return api_success(await enrich_ride(ride, user))


@router.post("")
async def post_ride(payload: RideCreateBody, user=Depends(get_current_user)):
    if not user.get("phone"):
        api_error("Add your phone number before posting a trip.")

    driver = await database.find_one("drivers", {"user_id": user["id"]})
    if not driver:
        api_error("Complete driver verification before posting a trip.")
    if driver.get("status") not in ("approved", "verified") or not driver.get("verified"):
        api_error("Complete driver verification before posting a trip.")
    if driver.get("verification_status") != "verified":
        api_error("Complete driver verification before posting a trip.")

    data = payload.model_dump()
    data.update(
        {
            "driver_id": driver["id"],
            "user_id": user["id"],
            "driver_name": driver.get("name") or user.get("name") or data.get("driver_name"),
            "driver_rating": driver.get("rating", data.get("driver_rating", 4.8)),
            "driver_verification_status": driver.get("verification_status"),
        }
    )
    return api_success(await create_ride(data))


@router.patch("/{ride_id}")
async def update_ride(ride_id: str, payload: RideUpdateBody, user=Depends(get_current_user)):
    existing = await database.find_one("rides", {"id": ride_id})
    if not existing or not is_public_ride(existing):
        api_error("Ride not found.", 404)
    existing = await apply_ride_lifecycle(existing)
    if user.get("role") != "admin" and existing.get("user_id") != user.get("id"):
        api_error("You can only update trips connected to your account.", 403)
    if is_final_trip_status(existing.get("status")):
        api_error("Completed, expired, or cancelled trips can no longer be edited.", 400)
    updates = {key: value for key, value in payload.model_dump().items() if value is not None}
    updates["updated_at"] = now_iso()
    ride = await database.update_one("rides", ride_id, updates)
    if not ride:
        api_error("Ride not found.", 404)
    return api_success(ride)


@router.post("/{ride_id}/start")
async def start_trip_route(ride_id: str, user=Depends(get_current_user)):
    try:
        return api_success(await start_trip(ride_id, user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 400)


@router.post("/{ride_id}/end")
async def end_trip_route(ride_id: str, user=Depends(get_current_user)):
    try:
        return api_success(await end_trip(ride_id, user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 400)


@router.get("/{ride_id}/live")
async def get_live_trip(ride_id: str, user=Depends(get_current_user)):
    try:
        return api_success(await live_trip_state(ride_id, user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 404)


@router.post("/{ride_id}/live-location")
async def update_live_trip_location(ride_id: str, payload: LiveLocationBody, user=Depends(get_current_user)):
    try:
        return api_success(await update_live_location(ride_id, user, payload.model_dump()))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 400)


@router.post("/{ride_id}/live-location/disable")
async def disable_live_trip_location(ride_id: str, user=Depends(get_current_user)):
    try:
        return api_success(await disable_live_location(ride_id, user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 400)


@router.delete("/{ride_id}")
async def delete_ride(ride_id: str, user=Depends(get_current_user)):
    existing = await database.find_one("rides", {"id": ride_id})
    if not existing or not is_public_ride(existing):
        api_error("Ride not found.", 404)
    if user.get("role") != "admin" and existing.get("user_id") != user.get("id"):
        api_error("You can only delete trips connected to your account.", 403)
    deleted = await database.delete_one("rides", ride_id)
    if not deleted:
        api_error("Ride not found.", 404)
    return api_success({"deleted": True})
