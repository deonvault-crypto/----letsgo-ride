from fastapi import APIRouter, Depends

from app.auth import get_current_user
from app.models.merchant import (
    MenuCategoryCreateBody,
    MenuItemCreateBody,
    MenuItemUpdateBody,
    MerchantOrderStatusBody,
    RestaurantCreateBody,
    RestaurantReviewBody,
    RestaurantUpdateBody,
)
from app.services.merchant_order_orchestration_service import transition_merchant_order
from app.services.merchant_service import (
    activate_restaurant,
    create_menu_category,
    create_menu_item,
    create_restaurant,
    list_my_restaurants,
    list_restaurant_orders,
    review_restaurant,
    submit_restaurant_for_review,
    update_menu_item,
    update_restaurant,
)
from app.services.merchant_workspace_service import get_restaurant_workspace
from app.utils import api_error, api_success


router = APIRouter(prefix="/merchant", tags=["merchant"])


def _require_merchant_account(user) -> None:
    if user.get("role") not in {"merchant", "admin"}:
        api_error("A Merchant account is required for restaurant and shop tools.", 403)


@router.post("/restaurants")
async def merchant_create_restaurant(payload: RestaurantCreateBody, user=Depends(get_current_user)):
    _require_merchant_account(user)
    return api_success(await create_restaurant(payload.model_dump(), user))


@router.get("/restaurants/my")
async def merchant_restaurants(user=Depends(get_current_user)):
    _require_merchant_account(user)
    return api_success(await list_my_restaurants(user))


@router.get("/restaurants/{restaurant_id}/workspace")
async def merchant_restaurant_workspace(restaurant_id: str, user=Depends(get_current_user)):
    _require_merchant_account(user)
    try:
        return api_success(await get_restaurant_workspace(restaurant_id, user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 404)


@router.patch("/restaurants/{restaurant_id}")
async def merchant_update_restaurant(
    restaurant_id: str,
    payload: RestaurantUpdateBody,
    user=Depends(get_current_user),
):
    _require_merchant_account(user)
    try:
        return api_success(await update_restaurant(restaurant_id, payload.model_dump(), user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 404)


@router.post("/restaurants/{restaurant_id}/submit")
async def merchant_submit_restaurant(restaurant_id: str, user=Depends(get_current_user)):
    _require_merchant_account(user)
    try:
        return api_success(await submit_restaurant_for_review(restaurant_id, user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 400)


@router.post("/restaurants/{restaurant_id}/activate")
async def merchant_activate_restaurant(restaurant_id: str, user=Depends(get_current_user)):
    _require_merchant_account(user)
    try:
        return api_success(await activate_restaurant(restaurant_id, user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 400)


@router.post("/restaurants/{restaurant_id}/review")
async def merchant_review_restaurant(
    restaurant_id: str,
    payload: RestaurantReviewBody,
    user=Depends(get_current_user),
):
    try:
        return api_success(await review_restaurant(restaurant_id, payload.status, payload.note, user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 400)


@router.post("/restaurants/{restaurant_id}/categories")
async def merchant_create_category(
    restaurant_id: str,
    payload: MenuCategoryCreateBody,
    user=Depends(get_current_user),
):
    _require_merchant_account(user)
    try:
        return api_success(await create_menu_category(restaurant_id, payload.model_dump(), user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 400)


@router.post("/restaurants/{restaurant_id}/menu-items")
async def merchant_create_menu_item(
    restaurant_id: str,
    payload: MenuItemCreateBody,
    user=Depends(get_current_user),
):
    _require_merchant_account(user)
    try:
        return api_success(await create_menu_item(restaurant_id, payload.model_dump(), user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 400)


@router.patch("/menu-items/{item_id}")
async def merchant_update_menu_item(
    item_id: str,
    payload: MenuItemUpdateBody,
    user=Depends(get_current_user),
):
    _require_merchant_account(user)
    try:
        return api_success(await update_menu_item(item_id, payload.model_dump(), user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 400)


@router.get("/restaurants/{restaurant_id}/orders")
async def merchant_orders(restaurant_id: str, user=Depends(get_current_user)):
    _require_merchant_account(user)
    try:
        return api_success(await list_restaurant_orders(restaurant_id, user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 404)


@router.post("/orders/{order_id}/status")
async def merchant_set_order_status(
    order_id: str,
    payload: MerchantOrderStatusBody,
    user=Depends(get_current_user),
):
    _require_merchant_account(user)
    try:
        return api_success(await transition_merchant_order(order_id, payload.status, payload.note, user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 400)
