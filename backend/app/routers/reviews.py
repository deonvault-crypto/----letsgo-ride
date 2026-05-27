from fastapi import APIRouter, Depends

from app.auth import get_current_user
from app.models.review import ReviewCreateBody
from app.services.review_service import create_review, pending_reviews_for_user, public_review_summary_for_user
from app.utils import api_error, api_success


router = APIRouter(prefix="/reviews", tags=["reviews"])


@router.get("/pending")
async def pending_reviews(user=Depends(get_current_user)):
    return api_success(await pending_reviews_for_user(user))


@router.get("/user/{user_id}")
async def public_user_reviews(user_id: str):
    return api_success(await public_review_summary_for_user(user_id))


@router.post("")
async def submit_review(payload: ReviewCreateBody, user=Depends(get_current_user)):
    try:
        return api_success(await create_review(payload.model_dump(), user))
    except PermissionError as exc:
        api_error(str(exc), 403)
    except ValueError as exc:
        api_error(str(exc), 400)
