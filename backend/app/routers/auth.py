from fastapi import APIRouter, Header

from app.config import get_settings
from app.models.user import RegisterBody, RequestOtpBody, VerifyOtpBody
from app.services.auth_service import create_or_update_user, find_user_by_token
from app.utils import api_error, api_success


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/request-otp")
async def request_otp(payload: RequestOtpBody):
    return api_success(
        {
            "phone": payload.phone,
            "message": "Mock OTP created for local development.",
            "dev_otp": get_settings().mock_otp,
        }
    )


@router.post("/verify-otp")
async def verify_otp(payload: VerifyOtpBody):
    if payload.otp != get_settings().mock_otp:
        api_error("Invalid OTP code.", 401)

    user = await create_or_update_user(payload.phone, payload.role)
    return api_success({"token": user["token"], "user": user})


@router.post("/register")
async def register(payload: RegisterBody):
    user = await create_or_update_user(payload.phone, payload.role, payload.name)
    if payload.city:
        user["city"] = payload.city
    return api_success({"token": user["token"], "user": user})


@router.get("/me")
async def me(authorization: str = Header(default="")):
    token = authorization.replace("Bearer", "").strip()
    if not token:
        api_error("Missing bearer token.", 401)
    user = await find_user_by_token(token)
    if not user:
        api_error("User not found.", 404)
    return api_success(user)
