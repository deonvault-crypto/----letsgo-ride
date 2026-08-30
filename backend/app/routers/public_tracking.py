from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth import get_current_user
from app.services.hailing_share_service import create_trip_share, public_trip_share
from app.utils import api_error, api_success


router = APIRouter(tags=["public-tracking"])


@router.post("/hailing/trips/{trip_id}/share")
async def share_hailing_trip(trip_id: str, user=Depends(get_current_user)):
    try:
        return api_success(await create_trip_share(trip_id, user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 400)


@router.get("/public/tracking/hailing/{token}")
async def read_shared_hailing_trip(token: str):
    try:
        return api_success(await public_trip_share(token))
    except ValueError as exc:
        api_error(str(exc), 404)
