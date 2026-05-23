from fastapi import APIRouter, Header

from app.config import get_settings
from app.models.user import (
    EmailLoginBody,
    EmailRegisterBody,
    ForgotPasswordBody,
    ResendEmailVerificationBody,
    RegisterBody,
    RequestOtpBody,
    ResetPasswordBody,
    UserUpdate,
    VerifyEmailBody,
    VerifyOtpBody,
)
from app.services.auth_service import (
    create_password_record,
    create_email_user,
    create_or_update_user,
    find_user_by_email,
    find_user_by_token,
    public_user,
    resend_email_verification,
    start_email_verification,
    verify_email_code,
    verify_email_user,
)
from app.utils import api_error, api_success
from app.database import database
from app.utils import now_iso


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/request-otp")
async def request_otp(payload: RequestOtpBody):
    return api_success(
        {
            "phone": payload.phone,
            "message": "Verification code request received.",
        }
    )


@router.post("/verify-otp")
async def verify_otp(payload: VerifyOtpBody):
    if payload.role == "admin":
        api_error("Admin accounts must be created by an existing administrator.", 403)
    if payload.otp != get_settings().mock_otp:
        api_error("Invalid OTP code.", 401)

    user = await create_or_update_user(payload.phone, payload.role)
    return api_success({"token": user["token"], "user": public_user(user)})


@router.post("/register")
async def register(payload: RegisterBody):
    if payload.role == "admin":
        api_error("Admin accounts must be created by an existing administrator.", 403)
    user = await create_or_update_user(payload.phone, payload.role, payload.name)
    if payload.city:
        user["city"] = payload.city
    return api_success({"token": user["token"], "user": public_user(user)})


@router.post("/email-register")
async def email_register(payload: EmailRegisterBody):
    if payload.role == "admin":
        api_error("Admin accounts must be created by an existing administrator.", 403)
    if payload.password != payload.confirm_password:
        api_error("Passwords do not match.", 400)
    user = await create_email_user(
        payload.name,
        payload.email,
        payload.password,
        payload.city,
        payload.role,
    )
    return api_success(
        {
            "email": user["email"],
            "email_verified": bool(user.get("email_verified", False)),
            "message": "Verification code sent.",
        }
    )


@router.post("/email-login")
async def email_login(payload: EmailLoginBody):
    try:
        user = await verify_email_user(payload.email, payload.password)
    except PermissionError as error:
        api_error(str(error), 403)
    if not user:
        api_error("Invalid email or password.", 401)
    return api_success({"token": user["token"], "user": public_user(user)})


@router.post("/verify-email")
async def verify_email(payload: VerifyEmailBody):
    user = await verify_email_code(payload.email, payload.code)
    if not user:
        api_error("Invalid or expired verification code.", 400)
    return api_success(
        {
            "email": user["email"],
            "email_verified": True,
            "message": "Email verified.",
        }
    )


@router.post("/resend-email-verification")
async def resend_verification(payload: ResendEmailVerificationBody):
    user = await resend_email_verification(payload.email)
    if not user:
        api_error("Account not found.", 404)
    return api_success(
        {
            "email": user["email"],
            "email_verified": bool(user.get("email_verified", False)),
            "message": "Verification code sent.",
        }
    )


@router.post("/forgot-password")
async def forgot_password(payload: ForgotPasswordBody):
    return api_success({"message": "If the account exists, a reset code will be sent."})


@router.post("/reset-password")
async def reset_password(payload: ResetPasswordBody):
    if payload.code != get_settings().mock_otp:
        api_error("Invalid reset code.", 401)

    user = await find_user_by_email(payload.email)
    if user:
        password_record = create_password_record(payload.password)
        await database.update_one(
            "users",
            user["id"],
            {
                **password_record,
                "updated_at": now_iso(),
            },
        )
    return api_success({"message": "Password reset completed."})


@router.get("/me")
async def me(authorization: str = Header(default="")):
    token = authorization.replace("Bearer", "").strip()
    if not token:
        api_error("Missing bearer token.", 401)
    user = await find_user_by_token(token)
    if not user:
        api_error("User not found.", 404)
    return api_success(public_user(user))


@router.patch("/me")
async def update_me(payload: UserUpdate, authorization: str = Header(default="")):
    token = authorization.replace("Bearer", "").strip()
    if not token:
        api_error("Missing bearer token.", 401)
    user = await find_user_by_token(token)
    if not user:
        api_error("User not found.", 404)
    updates = {key: value for key, value in payload.model_dump().items() if value is not None}
    if updates.get("role") == "admin":
        api_error("Admin role cannot be requested from the mobile app.", 403)
    updates.pop("email_verified", None)
    updates.pop("profile_photo_verified", None)
    if updates.get("email") and updates["email"].lower().strip() != (user.get("email") or "").lower().strip():
        updates["email"] = updates["email"].lower().strip()
        updates["email_verified"] = False
        updates["email_verified_at"] = None
    updates["updated_at"] = now_iso()
    updated = await database.update_one("users", user["id"], updates)
    if updated and updates.get("email_verified") is False:
        await start_email_verification(updated, force=True)
    return api_success(public_user(updated or user))


@router.delete("/me")
async def delete_me(authorization: str = Header(default="")):
    token = authorization.replace("Bearer", "").strip()
    if not token:
        api_error("Missing bearer token.", 401)
    user = await find_user_by_token(token)
    if not user:
        api_error("User not found.", 404)
    timestamp = now_iso()
    await database.update_one(
        "users",
        user["id"],
        {
            "name": "Deleted account",
            "phone": "",
            "email": "",
            "token": "",
            "status": "deleted",
            "deleted_at": timestamp,
            "updated_at": timestamp,
        },
    )
    return api_success({"deleted": True})
