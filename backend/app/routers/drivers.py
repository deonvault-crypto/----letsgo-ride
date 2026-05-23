from fastapi import APIRouter, Depends

from app.auth import get_current_user, get_optional_current_user
from app.database import database
from app.models.driver import DriverApplicationBody, VehicleBody
from app.services.driver_service import create_driver_application
from app.utils import api_error, api_success, new_id, now_iso


router = APIRouter(prefix="/drivers", tags=["drivers"])


@router.post("/apply")
async def apply(payload: DriverApplicationBody, user=Depends(get_current_user)):
    return api_success(await create_driver_application(payload.model_dump(), user))


@router.get("/me")
async def my_driver_profile(user=Depends(get_optional_current_user)):
    if not user:
        return api_success(
            {
                "status": "not_signed_in",
                "verified": False,
                "verification_status": "not_started",
                "message": "Sign in to manage a driver account.",
            }
        )
    profile = await database.find_one("drivers", {"user_id": user["id"]})
    if not profile:
        return api_success(
            {
                "status": "not_applied",
                "verified": False,
                "verification_status": "not_started",
                "message": "Driver profile has not been created yet.",
            }
        )
    return api_success(profile)


@router.post("/vehicle")
async def add_vehicle(payload: VehicleBody, user=Depends(get_current_user)):
    driver = await database.find_one("drivers", {"user_id": user["id"]})
    if not driver:
        api_error("Create a driver profile before adding a vehicle.")
    timestamp = now_iso()
    vehicle = {
        "id": new_id(),
        "driver_id": driver["id"],
        "user_id": user["id"],
        "is_demo": False,
        "created_at": timestamp,
        "updated_at": timestamp,
        **payload.model_dump(),
    }
    return api_success(await database.insert_one("vehicles", vehicle))


@router.get("/{driver_id}")
async def driver_detail(driver_id: str):
    driver = await database.find_one("drivers", {"id": driver_id})
    if not driver:
        api_error("Driver not found.", 404)
    return api_success(driver)
