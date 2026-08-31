from fastapi import APIRouter, Depends, Request

from app.auth import get_current_user
from app.models.courier import CourierLocationBody
from app.services.courier_presence_service import update_courier_presence
from app.services.rate_limit_service import RateLimit, rate_limit_service
from app.utils import api_error, api_success


router = APIRouter(prefix="/operations/courier", tags=["courier-presence"])


@router.post("/presence")
async def courier_presence(
    payload: CourierLocationBody,
    request: Request,
    user=Depends(get_current_user),
):
    await rate_limit_service.enforce(
        request,
        "courier-presence",
        RateLimit(30, 300),
        identity=str(user.get("id") or ""),
    )
    try:
        return api_success(await update_courier_presence(user, payload.model_dump()))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 400)
