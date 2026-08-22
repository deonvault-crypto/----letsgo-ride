from fastapi import APIRouter, Depends

from app.auth import get_current_user
from app.models.courier import (
    CourierAssignBody,
    CourierCancelBody,
    CourierCreateBody,
    CourierLocationBody,
    CourierQuoteBody,
    CourierStatusBody,
)
from app.services.courier_service import (
    assign_delivery,
    cancel_delivery,
    create_delivery,
    get_delivery,
    list_delivery_events,
    list_user_deliveries,
    set_delivery_quote,
    tracking_state,
    update_courier_location,
    update_delivery_status,
)
from app.services.delivery_quote_service import maybe_auto_quote_delivery
from app.utils import api_error, api_success


router = APIRouter(prefix="/courier", tags=["courier"])


@router.post("/deliveries")
async def create_courier_delivery(payload: CourierCreateBody, user=Depends(get_current_user)):
    created = await create_delivery(payload.model_dump(), user)
    quoted = await maybe_auto_quote_delivery(
        created["id"],
        actor_user_id=str(user.get("id") or ""),
    )
    return api_success(quoted)


@router.get("/deliveries/my")
async def my_courier_deliveries(user=Depends(get_current_user)):
    return api_success(await list_user_deliveries(user))


@router.get("/deliveries/{delivery_id}")
async def courier_delivery_detail(delivery_id: str, user=Depends(get_current_user)):
    try:
        return api_success(await get_delivery(delivery_id, user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 404)


@router.get("/deliveries/{delivery_id}/events")
async def courier_delivery_events(delivery_id: str, user=Depends(get_current_user)):
    try:
        return api_success(await list_delivery_events(delivery_id, user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 404)


@router.post("/deliveries/{delivery_id}/cancel")
async def cancel_courier_delivery(
    delivery_id: str,
    payload: CourierCancelBody,
    user=Depends(get_current_user),
):
    try:
        return api_success(await cancel_delivery(delivery_id, user, payload.reason))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 400)


@router.post("/deliveries/{delivery_id}/quote")
async def quote_courier_delivery(
    delivery_id: str,
    payload: CourierQuoteBody,
    user=Depends(get_current_user),
):
    try:
        return api_success(await set_delivery_quote(delivery_id, payload.model_dump(), user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 400)


@router.post("/deliveries/{delivery_id}/assign")
async def assign_courier_delivery(
    delivery_id: str,
    payload: CourierAssignBody,
    user=Depends(get_current_user),
):
    try:
        return api_success(await assign_delivery(delivery_id, payload.courier_user_id, user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 400)


@router.post("/deliveries/{delivery_id}/status")
async def set_courier_delivery_status(
    delivery_id: str,
    payload: CourierStatusBody,
    user=Depends(get_current_user),
):
    try:
        return api_success(await update_delivery_status(delivery_id, payload.status, user, payload.note))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 400)


@router.get("/deliveries/{delivery_id}/tracking")
async def get_courier_tracking(delivery_id: str, user=Depends(get_current_user)):
    try:
        return api_success(await tracking_state(delivery_id, user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 404)


@router.post("/deliveries/{delivery_id}/location")
async def set_courier_location(
    delivery_id: str,
    payload: CourierLocationBody,
    user=Depends(get_current_user),
):
    try:
        return api_success(await update_courier_location(delivery_id, payload.model_dump(), user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 400)
