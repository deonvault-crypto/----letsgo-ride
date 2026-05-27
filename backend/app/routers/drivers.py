from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends

from app.auth import get_current_user, get_optional_current_user
from app.database import database
from app.models.driver import DriverApplicationBody, VehicleBody
from app.services.driver_service import create_driver_application
from app.services.profile_photo_service import absolute_profile_photo_url
from app.services.review_service import completed_trips_count_for_user, public_review_summary_for_user
from app.services.verification_service import public_identity_verification_state, public_verification_status
from app.utils import api_error, api_success, new_id, now_iso


router = APIRouter(prefix="/drivers", tags=["drivers"])


def _public_photo_url(user: Optional[Dict[str, Any]]) -> Optional[str]:
    if not user:
        return None
    photo_url = user.get("profile_photo_url") or user.get("profile_picture") or user.get("avatar_url") or user.get("photo_url")
    if not photo_url or str(photo_url).startswith("file://"):
        return None
    return absolute_profile_photo_url(str(photo_url))


async def public_driver_profile(driver):
    user = await database.find_one("users", {"id": driver.get("user_id")}) if driver.get("user_id") else None
    vehicles = await database.find_many("vehicles", {"driver_id": driver["id"]})
    latest_vehicle = sorted(vehicles, key=lambda item: item.get("created_at") or "", reverse=True)[0] if vehicles else None
    vehicle_name = None
    vehicle_color = None
    if latest_vehicle:
        vehicle_name = f"{latest_vehicle.get('make', '')} {latest_vehicle.get('model', '')}".strip()
        vehicle_color = latest_vehicle.get("color")
    elif driver.get("vehicle"):
        vehicle_name = driver.get("vehicle")

    status = public_verification_status(driver)
    user_id = driver.get("user_id")
    review_summary = await public_review_summary_for_user(user_id) if user_id else {"average_rating": None, "review_count": 0, "latest_reviews": [], "completed_trips_count": 0}
    completed_trips_count = await completed_trips_count_for_user(user_id, "driver") if user_id else 0
    rating = review_summary["average_rating"] or driver.get("rating") or (user or {}).get("rating")

    return {
        "id": driver.get("id"),
        "driver_id": driver.get("id"),
        "name": (user or {}).get("name") or driver.get("name") or "LetsGoRide Driver",
        "profile_photo_url": _public_photo_url(user),
        "verified": bool(driver.get("verified") and status == "approved"),
        "verification_status": status,
        "verification_provider": "manual",
        "identity_verification_state": public_identity_verification_state(status),
        "rating": rating,
        "review_count": review_summary["review_count"],
        "average_rating": review_summary["average_rating"],
        "completed_trips_count": completed_trips_count,
        "vehicle": vehicle_name,
        "vehicle_name": vehicle_name,
        "vehicle_color": vehicle_color,
        "bio": (user or {}).get("bio") or driver.get("bio"),
        "latest_reviews": review_summary["latest_reviews"],
    }


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
    return api_success(await public_driver_profile(profile))


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
    return api_success(await public_driver_profile(driver))
