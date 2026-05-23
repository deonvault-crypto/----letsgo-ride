from fastapi import APIRouter

from app.database import database
from app.models.request import RideRequestCreateBody, RideRequestUpdateBody
from app.utils import api_error, api_success, new_id, now_iso


router = APIRouter(prefix="/requests", tags=["requests"])


@router.post("")
async def create_request(payload: RideRequestCreateBody):
    ride = await database.find_one("rides", {"id": payload.ride_id})
    if not ride:
        api_error("Ride not found.", 404)

    timestamp = now_iso()
    request = {
        "id": new_id(),
        "status": "pending",
        "ride_snapshot": ride,
        "is_demo": False,
        "created_at": timestamp,
        "updated_at": timestamp,
        **payload.model_dump(),
    }
    return api_success(await database.insert_one("ride_requests", request))


@router.get("/my")
async def my_requests():
    return api_success(await database.find_many("ride_requests"))


@router.get("/driver")
async def driver_requests():
    return api_success(await database.find_many("ride_requests"))


@router.patch("/{request_id}")
async def update_request(request_id: str, payload: RideRequestUpdateBody):
    request = await database.update_one(
        "ride_requests",
        request_id,
        {"status": payload.status, "updated_at": now_iso()},
    )
    if not request:
        api_error("Ride request not found.", 404)
    return api_success(request)


@router.delete("/{request_id}")
async def delete_request(request_id: str):
    deleted = await database.delete_one("ride_requests", request_id)
    if not deleted:
        api_error("Ride request not found.", 404)
    return api_success({"deleted": True})
