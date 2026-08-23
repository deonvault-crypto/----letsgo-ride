from fastapi import APIRouter, Depends

from app.auth import get_current_user
from app.models.food import FoodCheckoutQuoteBody, FoodOrderCancelBody, FoodOrderCreateBody
from app.services.food_checkout_service import preview_food_checkout
from app.services.food_service import (
    cancel_food_order,
    create_food_order,
    get_customer_order,
    get_restaurant,
    get_restaurant_menu,
    list_customer_orders,
    list_order_events,
    list_restaurants,
)
from app.utils import api_error, api_success


router = APIRouter(prefix="/food", tags=["food"])


@router.get("/restaurants")
async def restaurants():
    return api_success(await list_restaurants())


@router.get("/restaurants/{restaurant_id}")
async def restaurant_detail(restaurant_id: str):
    try:
        return api_success(await get_restaurant(restaurant_id))
    except ValueError as exc:
        api_error(str(exc), 404)


@router.get("/restaurants/{restaurant_id}/menu")
async def restaurant_menu(restaurant_id: str):
    try:
        return api_success(await get_restaurant_menu(restaurant_id))
    except ValueError as exc:
        api_error(str(exc), 404)


@router.post("/checkout/quote")
async def food_checkout_quote(payload: FoodCheckoutQuoteBody):
    try:
        return api_success(await preview_food_checkout(payload.model_dump()))
    except ValueError as exc:
        api_error(str(exc), 400)


@router.post("/orders")
async def place_food_order(payload: FoodOrderCreateBody, user=Depends(get_current_user)):
    try:
        return api_success(await create_food_order(payload.model_dump(), user))
    except ValueError as exc:
        api_error(str(exc), 400)


@router.get("/orders/my")
async def my_food_orders(user=Depends(get_current_user)):
    return api_success(await list_customer_orders(user))


@router.get("/orders/{order_id}")
async def food_order_detail(order_id: str, user=Depends(get_current_user)):
    try:
        return api_success(await get_customer_order(order_id, user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 404)


@router.get("/orders/{order_id}/events")
async def food_order_events(order_id: str, user=Depends(get_current_user)):
    try:
        return api_success(await list_order_events(order_id, user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 404)


@router.post("/orders/{order_id}/cancel")
async def cancel_order(order_id: str, payload: FoodOrderCancelBody, user=Depends(get_current_user)):
    try:
        return api_success(await cancel_food_order(order_id, user, payload.reason))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 400)
