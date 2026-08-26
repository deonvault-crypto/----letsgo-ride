from fastapi import APIRouter, Request

from app.database import database
from app.models.report import WaitlistBody
from app.services.rate_limit_service import RateLimit, rate_limit_service
from app.utils import api_success, new_id, now_iso


router = APIRouter(prefix="/waitlist", tags=["waitlist"])


async def _create(collection: str, payload: WaitlistBody):
    timestamp = now_iso()
    item = {
        "id": new_id(),
        "status": "new",
        "is_demo": False,
        "created_at": timestamp,
        "updated_at": timestamp,
        **payload.model_dump(),
    }
    return api_success(await database.insert_one(collection, item))


@router.post("")
async def waitlist(payload: WaitlistBody, request: Request):
    await rate_limit_service.enforce(request, "waitlist_general", RateLimit(requests=5, window_seconds=3600))
    return await _create("waitlist", payload)


@router.post("/passenger-interest")
async def passenger_interest(payload: WaitlistBody, request: Request):
    await rate_limit_service.enforce(request, "waitlist_passenger", RateLimit(requests=5, window_seconds=3600))
    return await _create("passenger_interests", payload)


@router.post("/driver-application")
async def driver_application(payload: WaitlistBody, request: Request):
    await rate_limit_service.enforce(request, "waitlist_driver", RateLimit(requests=3, window_seconds=3600))
    return await _create("driver_applications", payload)
