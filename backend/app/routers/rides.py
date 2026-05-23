from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.auth import get_current_user
from app.database import database
from app.models.ride import RideCreateBody, RideUpdateBody
from app.services.ride_service import create_ride, is_public_ride, list_public_rides, search_rides
from app.utils import api_error, api_success, now_iso


router = APIRouter(prefix="/rides", tags=["rides"])


@router.get("")
async def list_rides():
    return api_success(await list_public_rides())


@router.get("/search")
async def search(
    origin: Optional[str] = None,
    destination: Optional[str] = None,
    date: Optional[str] = None,
    seats: int = Query(default=1, ge=1),
):
    return api_success(await search_rides(origin, destination, seats, date))


@router.get("/{ride_id}")
async def ride_detail(ride_id: str):
    ride = await database.find_one("rides", {"id": ride_id})
    if not ride or not is_public_ride(ride):
        api_error("Ride not found.", 404)
    return api_success(ride)


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
        }
    )
    return api_success(await create_ride(data))


@router.patch("/{ride_id}")
async def update_ride(ride_id: str, payload: RideUpdateBody):
    updates = {key: value for key, value in payload.model_dump().items() if value is not None}
    updates["updated_at"] = now_iso()
    ride = await database.update_one("rides", ride_id, updates)
    if not ride:
        api_error("Ride not found.", 404)
    return api_success(ride)


@router.delete("/{ride_id}")
async def delete_ride(ride_id: str):
    deleted = await database.delete_one("rides", ride_id)
    if not deleted:
        api_error("Ride not found.", 404)
    return api_success({"deleted": True})
