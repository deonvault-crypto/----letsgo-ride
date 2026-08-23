from fastapi import APIRouter, Depends

from app.auth import get_current_user
from app.models.operations import AvailabilityCreateBody, CourierOnlineBody, CourierProfileCreateBody
from app.services.courier_earnings_service import courier_earnings_summary
from app.services.operations_service import (
    approve_courier_profile,
    assigned_courier_deliveries,
    claim_courier_offer,
    create_availability,
    create_courier_profile,
    delete_availability,
    get_courier_profile,
    list_availability,
    list_courier_offers,
    set_courier_online,
)
from app.utils import api_error, api_success


router = APIRouter(prefix="/operations", tags=["operations"])


def _require_work_account(user) -> None:
    if user.get("role") not in {"driver", "courier", "admin"}:
        api_error("A Driver or Courier account is required for this workspace.", 403)


def _require_courier_account(user) -> None:
    if user.get("role") not in {"courier", "admin"}:
        api_error("A Courier account is required for delivery work.", 403)


@router.get("/availability")
async def my_availability(user=Depends(get_current_user)):
    _require_work_account(user)
    return api_success(await list_availability(user))


@router.post("/availability")
async def add_availability(payload: AvailabilityCreateBody, user=Depends(get_current_user)):
    _require_work_account(user)
    try:
        return api_success(await create_availability(payload.model_dump(), user))
    except ValueError as exc:
        api_error(str(exc), 400)


@router.delete("/availability/{item_id}")
async def remove_availability(item_id: str, user=Depends(get_current_user)):
    _require_work_account(user)
    try:
        return api_success({"deleted": await delete_availability(item_id, user)})
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 404)


@router.get("/courier/profile")
async def courier_profile(user=Depends(get_current_user)):
    _require_courier_account(user)
    return api_success(await get_courier_profile(user))


@router.post("/courier/profile")
async def courier_profile_create(payload: CourierProfileCreateBody, user=Depends(get_current_user)):
    _require_courier_account(user)
    return api_success(await create_courier_profile(payload.model_dump(), user))


@router.post("/courier/online")
async def courier_online(payload: CourierOnlineBody, user=Depends(get_current_user)):
    _require_courier_account(user)
    try:
        return api_success(await set_courier_online(user, payload.online))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 400)


@router.post("/courier/profiles/{profile_id}/approve")
async def courier_profile_approve(profile_id: str, user=Depends(get_current_user)):
    # Approval is intentionally admin-only inside approve_courier_profile.
    try:
        return api_success(await approve_courier_profile(profile_id, user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 404)


@router.get("/courier/deliveries")
async def courier_assigned_deliveries(user=Depends(get_current_user)):
    _require_courier_account(user)
    return api_success(await assigned_courier_deliveries(user))


@router.get("/courier/earnings")
async def courier_earnings(user=Depends(get_current_user)):
    _require_courier_account(user)
    return api_success(await courier_earnings_summary(user))


@router.get("/courier/offers")
async def courier_delivery_offers(user=Depends(get_current_user)):
    _require_courier_account(user)
    try:
        return api_success(await list_courier_offers(user))
    except PermissionError as exc:
        api_error(str(exc), 403)


@router.post("/courier/offers/{delivery_id}/claim")
async def courier_claim_delivery_offer(delivery_id: str, user=Depends(get_current_user)):
    _require_courier_account(user)
    try:
        return api_success(await claim_courier_offer(delivery_id, user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 409)
