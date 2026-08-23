from fastapi import APIRouter, Depends

from app.auth import get_current_user
from app.models.courier import (
    CourierAssignBody,
    CourierCancelBody,
    CourierCreateBody,
    CourierLocationBody,
    CourierQuoteBody,
    CourierQuotePreviewBody,
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
from app.services.delivery_quote_service import (
    apply_calculated_delivery_quote,
    calculate_delivery_quote,
    customer_quote_preview,
)
from app.services.pricing_service import PricingNotConfiguredError
from app.services.routing_service import (
    RoutingError,
    RoutingNoResultError,
    RoutingNotConfiguredError,
)
from app.utils import api_error, api_success


router = APIRouter(prefix="/courier", tags=["courier"])


def _point(value):
    return value.model_dump() if value else None


def _pricing_unavailable_error() -> None:
    api_error("Courier pricing is temporarily unavailable. Please try again later.", 503)


@router.post("/quote-preview")
async def preview_courier_quote(payload: CourierQuotePreviewBody):
    # Guests may explore real route pricing. Creating a delivery still requires
    # authentication, so preview access cannot create work or mutate customer data.
    try:
        return api_success(
            await customer_quote_preview(
                payload.pickup_address,
                payload.dropoff_address,
                pickup_location=_point(payload.pickup_location),
                dropoff_location=_point(payload.dropoff_location),
            )
        )
    except PricingNotConfiguredError:
        _pricing_unavailable_error()
    except RoutingNotConfiguredError:
        api_error("Courier routing is temporarily unavailable.", 503)
    except RoutingNoResultError as exc:
        api_error(str(exc), 404)
    except RoutingError:
        api_error("We could not calculate this delivery route right now.", 502)


@router.post("/deliveries")
async def create_courier_delivery(payload: CourierCreateBody, user=Depends(get_current_user)):
    # Fail closed before writing a customer job. A direct courier request must have
    # a real server-side route and price before it can enter the matching pool.
    try:
        calculated = await calculate_delivery_quote(
            payload.pickup_address,
            payload.dropoff_address,
            pickup_location=_point(payload.pickup_location),
            dropoff_location=_point(payload.dropoff_location),
        )
    except PricingNotConfiguredError:
        _pricing_unavailable_error()
    except RoutingNotConfiguredError:
        api_error("Courier routing is temporarily unavailable.", 503)
    except RoutingNoResultError as exc:
        api_error(str(exc), 404)
    except RoutingError:
        api_error("We could not calculate this delivery route right now.", 502)

    created = await create_delivery(payload.model_dump(), user)
    quoted = await apply_calculated_delivery_quote(
        created,
        calculated,
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
