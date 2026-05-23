from typing import Optional

from fastapi import APIRouter, Query

from app.database import database
from app.models.ride import RideCreateBody, RideUpdateBody
from app.services.ride_service import create_ride, search_rides
from app.utils import api_error, api_success, now_iso


router = APIRouter(prefix="/rides", tags=["rides"])


@router.get("")
async def list_rides():
    return api_success(await database.find_many("rides"))


@router.get("/search")
async def search(
    origin: Optional[str] = None,
    destination: Optional[str] = None,
    seats: int = Query(default=1, ge=1),
):
    return api_success(await search_rides(origin, destination, seats))


@router.get("/{ride_id}")
async def ride_detail(ride_id: str):
    ride = await database.find_one("rides", {"id": ride_id})
    if not ride:
        api_error("Ride not found.", 404)
    return api_success(ride)


@router.post("")
async def post_ride(payload: RideCreateBody):
    return api_success(await create_ride(payload.model_dump()))


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
