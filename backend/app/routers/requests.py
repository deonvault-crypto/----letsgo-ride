from fastapi import APIRouter, Depends

from app.auth import get_current_user
from app.database import database
from app.models.request import RideRequestCreateBody, RideRequestUpdateBody
from app.utils import api_error, api_success, new_id, now_iso


router = APIRouter(prefix="/requests", tags=["requests"])


@router.post("")
async def create_request(payload: RideRequestCreateBody, user=Depends(get_current_user)):
    if not user.get("phone"):
        api_error("Add your phone number before booking a seat.")
    ride = await database.find_one("rides", {"id": payload.ride_id})
    if not ride:
        api_error("Ride not found.", 404)

    timestamp = now_iso()
    request = {
        "id": new_id(),
        "status": "pending",
        "user_id": user["id"],
        "ride_snapshot": ride,
        "is_demo": False,
        "created_at": timestamp,
        "updated_at": timestamp,
        **payload.model_dump(),
        "passenger_name": payload.passenger_name or user.get("name") or "Passenger account",
        "passenger_phone": payload.passenger_phone or user.get("phone"),
    }
    return api_success(await database.insert_one("ride_requests", request))


@router.get("/my")
async def my_requests(user=Depends(get_current_user)):
    return api_success(await database.find_many("ride_requests", {"user_id": user["id"]}))


@router.get("/driver")
async def driver_requests(user=Depends(get_current_user)):
    driver = await database.find_one("drivers", {"user_id": user["id"]})
    if not driver:
        return api_success([])
    rides = await database.find_many("rides", {"driver_id": driver["id"]})
    ride_ids = {ride["id"] for ride in rides}
    requests = await database.find_many("ride_requests")
    return api_success([request for request in requests if request.get("ride_id") in ride_ids])


@router.patch("/{request_id}")
async def update_request(request_id: str, payload: RideRequestUpdateBody, user=Depends(get_current_user)):
    if payload.status == "confirmed" and not user.get("phone"):
        api_error("Add your phone number before accepting a passenger request.")
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
