from fastapi import APIRouter, Depends, File, Request, UploadFile

from app.config import get_settings
from app.auth import get_current_user
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
    DuplicateVerifiedEmailError,
    ExistingUnverifiedEmailError,
    create_email_user,
    create_or_update_user,
    find_user_by_email,
    find_user_by_pending_email,
    find_user_by_phone,
    find_user_by_token,
    public_user,
    resend_email_verification,
    reset_email_password,
    start_password_reset,
    start_email_verification,
    verify_email_code,
    verify_email_user,
)
from app.services.profile_photo_service import ProfilePhotoUploadError, save_profile_photo
from app.services.account_deletion_service import (
    AccountDeletionBlockedError,
    delete_account,
)
from app.utils import api_error, api_success
from app.database import database
from app.utils import now_iso
from app.services.rate_limit_service import RateLimit, rate_limit_service
from pymongo.errors import DuplicateKeyError


router = APIRouter(prefix="/auth", tags=["auth"])
INACTIVE_ACCOUNT_STATUSES = {"deleted", "suspended"}


def _require_public_customer_signup(role: str) -> None:
    if role != "passenger":
        api_error(
            "Driver, Courier and Merchant accounts use their own reviewed onboarding. Public signup creates a customer account.",
            403,
        )


def _inactive_account(user) -> bool:
    return bool(user) and str(user.get("status") or "active").strip().lower() in INACTIVE_ACCOUNT_STATUSES


async def _email_account(email: str):
    return await find_user_by_email(email) or await find_user_by_pending_email(email)


@router.post("/request-otp")
async def request_otp(payload: RequestOtpBody, request: Request):
    await rate_limit_service.enforce(request, "auth-otp-send", RateLimit(5, 3600), identity=payload.phone)
    api_error("Phone verification is not available. Use secure email sign-in.", 503)


@router.post("/verify-otp")
async def verify_otp(payload: VerifyOtpBody, request: Request):
    await rate_limit_service.enforce(request, "auth-otp-verify", RateLimit(10, 900), identity=payload.phone)
    api_error("Phone verification is not available. Use secure email sign-in.", 503)


@router.post("/register")
async def register(payload: RegisterBody, request: Request):
    await rate_limit_service.enforce(request, "auth-register", RateLimit(5, 3600), identity=payload.phone)
    api_error("Phone registration is not available. Use secure email sign-up.", 503)


@router.post("/email-register")
async def email_register(payload: EmailRegisterBody, request: Request):
    await rate_limit_service.enforce(request, "auth-email-register", RateLimit(5, 3600), identity=payload.email)
    _require_public_customer_signup(payload.role)
    if payload.password != payload.confirm_password:
        api_error("Passwords do not match.", 400)
    try:
        user = await create_email_user(
            payload.name,
            payload.email,
            payload.password,
            payload.city,
            "passenger",
        )
    except DuplicateVerifiedEmailError as error:
        api_error(str(error), 409)
    except ExistingUnverifiedEmailError as error:
        api_error(str(error), 409)
    except RuntimeError as error:
        api_error(str(error), 503)
    return api_success(
        {
            "email": user["email"],
            "email_verified": bool(user.get("email_verified", False)),
            "message": "Verification code sent.",
        }
    )


@router.post("/email-login")
async def email_login(payload: EmailLoginBody, request: Request):
    await rate_limit_service.enforce(request, "auth-email-login-short", RateLimit(5, 60), identity=payload.email)
    await rate_limit_service.enforce(request, "auth-email-login-long", RateLimit(20, 3600), identity=payload.email)
    candidate = await find_user_by_email(payload.email)
    if _inactive_account(candidate):
        # Keep the public response indistinguishable from a bad credential while
        # preventing a disabled account from minting a fresh session token.
        api_error("Invalid email or password.", 401)
    try:
        user = await verify_email_user(payload.email, payload.password)
    except PermissionError:
        api_error("Invalid email or password.", 401)
    if not user:
        api_error("Invalid email or password.", 401)
    return api_success({"token": user["token"], "user": public_user(user)})


@router.post("/verify-email")
async def verify_email(payload: VerifyEmailBody, request: Request):
    await rate_limit_service.enforce(request, "auth-email-verify", RateLimit(10, 900), identity=payload.email)
    candidate = await _email_account(payload.email)
    if _inactive_account(candidate):
        api_error("Invalid or expired verification code.", 400)
    user = await verify_email_code(payload.email, payload.code)
    if not user:
        api_error("Invalid or expired verification code.", 400)
    response = {
        "email": user["email"],
        "email_verified": True,
        "message": "Email verified.",
    }
    if user.get("token"):
        response["token"] = user["token"]
        response["user"] = public_user(user)
    return api_success(response)


@router.post("/resend-email-verification")
async def resend_verification(payload: ResendEmailVerificationBody, request: Request):
    await rate_limit_service.enforce(request, "auth-email-resend", RateLimit(3, 3600), identity=payload.email)
    candidate = await _email_account(payload.email)
    if _inactive_account(candidate):
        api_error("Account not found.", 404)
    try:
        user = await resend_email_verification(payload.email)
    except RuntimeError as error:
        api_error(str(error), 503)
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
async def forgot_password(payload: ForgotPasswordBody, request: Request):
    await rate_limit_service.enforce(request, "auth-password-forgot", RateLimit(3, 3600), identity=payload.email)
    candidate = await find_user_by_email(payload.email)
    if not _inactive_account(candidate):
        try:
            await start_password_reset(payload.email)
        except RuntimeError as error:
            api_error(str(error), 503)
    # The response is deliberately identical for missing and disabled accounts.
    return api_success({"message": "If the account exists, a reset code will be sent."})


@router.post("/reset-password")
async def reset_password(payload: ResetPasswordBody, request: Request):
    await rate_limit_service.enforce(request, "auth-password-reset", RateLimit(10, 3600), identity=payload.email)
    if payload.confirm_password and payload.password != payload.confirm_password:
        api_error("Passwords do not match.", 400)
    candidate = await find_user_by_email(payload.email)
    if _inactive_account(candidate):
        api_error("That code is incorrect or expired. Please request a new code.", 400)
    ok = await reset_email_password(payload.email, payload.code, payload.password)
    if not ok:
        api_error("That code is incorrect or expired. Please request a new code.", 400)
    return api_success({"message": "Password reset completed."})


@router.get("/me")
async def me(user=Depends(get_current_user)):
    return api_success(public_user(user))


@router.patch("/me")
async def update_me(payload: UserUpdate, request: Request, user=Depends(get_current_user)):
    workforce_identity_fields = {"email", "phone", "city", "bio", "travel_preferences"}
    forbidden = payload.model_fields_set & workforce_identity_fields if user.get("role") in {"driver", "courier", "merchant", "admin"} else set()
    if forbidden:
        api_error("Contact LetsGoRide Support to change verified account details.", 403)
    updates = {key: value for key, value in payload.model_dump().items() if value is not None}

    # Product identity is immutable. Customer, Driver, Courier and Merchant are
    # separate account types; changing profile details must never switch products.
    updates.pop("role", None)
    updates.pop("email_verified", None)
    updates.pop("profile_photo_verified", None)

    requested_email = updates.pop("email", None)
    if requested_email and requested_email.lower().strip() != (user.get("email") or "").lower().strip():
        await rate_limit_service.enforce(request, "auth-profile-email-change", RateLimit(5, 3600), identity=str(user.get("id") or ""))
        requested_email = requested_email.lower().strip()
        existing_email_user = await find_user_by_email(requested_email)
        if existing_email_user and existing_email_user.get("id") != user.get("id"):
            api_error("This email already belongs to another account.", 409)
        pending_owner = await database.find_one("users", {"pending_email": requested_email})
        if pending_owner and pending_owner.get("id") != user.get("id"):
            api_error("This email already belongs to another account.", 409)
        updates["pending_email"] = requested_email
    updates["updated_at"] = now_iso()
    try:
        updated = await database.update_one("users", user["id"], updates)
    except DuplicateKeyError:
        api_error("This email already belongs to another account.", 409)
    if updated and updates.get("pending_email"):
        await start_email_verification(updated, force=True)
    return api_success(public_user(updated or user))


@router.post("/me/profile-photo")
async def upload_profile_photo(file: UploadFile = File(...), user=Depends(get_current_user)):
    try:
        updated = await save_profile_photo(user, file)
    except ValueError as error:
        api_error(str(error), 400)
    except ProfilePhotoUploadError as error:
        api_error(str(error), error.status_code)
    return api_success(public_user(updated))


@router.post("/logout")
async def logout(user=Depends(get_current_user)):
    await database.update_one(
        "users",
        user["id"],
        {"token": "", "token_issued_at": None, "token_expires_at": None, "sessions_revoked_at": now_iso(), "updated_at": now_iso()},
    )
    return api_success({"logged_out": True})


@router.delete("/me")
async def delete_me(user=Depends(get_current_user)):
    try:
        result = await delete_account(user)
    except AccountDeletionBlockedError as error:
        api_error(str(error), 409)
    return api_success(result)
