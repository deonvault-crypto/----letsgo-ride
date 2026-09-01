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


def _require_driver_account(user: Dict[str, Any]) -> None:
    if user.get("role") not in {"driver", "admin"}:
        api_error("A Driver account is required for carpool driver tools.", 403)


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
    rating = review_summary["average_rating"] if review_summary["review_count"] > 0 else None

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
    _require_driver_account(user)
    try:
        return api_success(await create_driver_application(payload.model_dump(), user))
    except PermissionError as exc:
        api_error(str(exc), 403)


@router.get("/me")
async def my_driver_profile(user=Depends(get_optional_current_user)):
    if not user:
        return api_success(
            {
                "status": "not_signed_in",
                "verified": False,
                "verification_status": "not_started",
                "message": "Sign in with a Driver account to manage carpool work.",
            }
        )
    if user.get("role") not in {"driver", "admin"}:
        return api_success(
            {
                "status": "wrong_account_type",
                "verified": False,
                "verification_status": "not_started",
                "message": "This is not a Driver account.",
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
    _require_driver_account(user)
    driver = await database.find_one("drivers", {"user_id": user["id"]})
    if not driver:
        api_error("Create a driver profile before adding a vehicle.")

    existing_vehicles = await database.find_many("vehicles", {"driver_id": driver["id"]})
    reviewed_driver = bool(driver.get("verified")) or str(driver.get("status") or "").lower() in {"approved", "verified", "active"}
    # A reviewed Driver who somehow reached production without a vehicle must be
    # able to complete that missing setup step. Once a vehicle exists, later swaps
    # remain support/review controlled instead of silently replacing trusted data.
    has_reviewed_vehicle = bool(existing_vehicles) or bool(str(driver.get("vehicle") or "").strip())
    if reviewed_driver and has_reviewed_vehicle:
        api_error(
            "Contact LetsGoRide Support to request a reviewed vehicle change.",
            403,
        )

    timestamp = now_iso()
    vehicle = {
        "id": new_id(),
        "driver_id": driver["id"],
        "user_id": user["id"],
        "created_at": timestamp,
        "updated_at": timestamp,
        **payload.model_dump(),
    }
    created = await database.insert_one("vehicles", vehicle)
    vehicle_name = f"{payload.make} {payload.model}".strip()
    await database.update_one("drivers", driver["id"], {"vehicle": vehicle_name, "updated_at": timestamp})
    return api_success(created)


@router.get("/{driver_id}")
async def driver_detail(driver_id: str):
    driver = await database.find_one("drivers", {"id": driver_id})
    if not driver:
        api_error("Driver not found.", 404)
    return api_success(await public_driver_profile(driver))
