import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from app.config import get_settings
from app.database import database
from app.models.user import normalize_email, validate_strong_password
from app.services.email_service import send_password_reset_email, send_verification_email
from app.utils import new_id, now_iso


class DuplicateVerifiedEmailError(Exception):
    pass


class ExistingUnverifiedEmailError(Exception):
    pass


PUBLIC_VERIFICATION_STATUSES = {
    "not_started",
    "pending",
    "needs_review",
    "verified",
    "rejected",
    "active",
}


async def find_user_by_phone(phone: str) -> Optional[Dict[str, Any]]:
    return await database.find_one("users", {"phone": phone})


async def find_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    return await database.find_one("users", {"email": normalize_email(email)})


async def find_user_by_token(token: str) -> Optional[Dict[str, Any]]:
    return await database.find_one("users", {"token": token})


def public_user(user: Dict[str, Any]) -> Dict[str, Any]:
    hidden = {
        "password_hash",
        "password_salt",
        "email_verification_code_hash",
        "email_verification_salt",
        "reset_code_hash",
        "reset_code_salt",
        "reset_salt",
        "token",
    }
    public = {key: value for key, value in user.items() if key not in hidden}
    if public.get("verification_provider"):
        public["verification_provider"] = "manual"
    if public.get("verification_status") not in PUBLIC_VERIFICATION_STATUSES:
        public["verification_status"] = "needs_review" if public.get("verification_status") else "not_started"
    return public


def hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        120000,
    ).hex()


def create_password_record(password: str) -> Dict[str, str]:
    salt = secrets.token_hex(16)
    return {"password_salt": salt, "password_hash": hash_password(password, salt)}


def create_code_record(code: str, prefix: str = "email_verification") -> Dict[str, str]:
    salt = secrets.token_hex(16)
    return {
        f"{prefix}_salt": salt,
        f"{prefix}_code_hash": hash_password(code, salt),
    }


def code_matches(user: Dict[str, Any], code: str, prefix: str = "email_verification") -> bool:
    salt = user.get(f"{prefix}_salt")
    code_hash = user.get(f"{prefix}_code_hash")
    if not salt or not code_hash:
        return False
    return code_hash == hash_password(code, salt)


def generate_email_code() -> str:
    return f"{secrets.randbelow(1000000):06d}"


def code_not_expired(user: Dict[str, Any], prefix: str = "email_verification") -> bool:
    expires_at = user.get(f"{prefix}_expires_at")
    if not expires_at:
        return False
    try:
        return datetime.fromisoformat(expires_at) > datetime.now(timezone.utc)
    except ValueError:
        return False


async def start_email_verification(user: Dict[str, Any], force: bool = False) -> Dict[str, Any]:
    now = datetime.now(timezone.utc)
    last_sent = user.get("email_verification_sent_at")
    if not force and last_sent:
        try:
            if datetime.fromisoformat(last_sent) + timedelta(seconds=60) > now:
                return user
        except ValueError:
            pass

    code = generate_email_code()
    updates = {
        **create_code_record(code),
        "email_verification_expires_at": (now + timedelta(minutes=15)).isoformat(),
        "email_verification_attempts": 0,
        "email_verification_sent_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }
    updated = await database.update_one("users", user["id"], updates) or {**user, **updates}
    sent = await send_verification_email(updated["email"], code)
    if not sent:
        raise RuntimeError("Email verification could not be sent.")
    return updated


async def create_or_update_user(phone: str, role: str, name: Optional[str] = None) -> Dict[str, Any]:
    existing = await find_user_by_phone(phone)
    token = f"auth_{new_id()}"
    timestamp = now_iso()

    if existing:
        updates = {
            "role": role or existing.get("role", "passenger"),
            "token": token,
            "updated_at": timestamp,
        }
        if name:
            updates["name"] = name
        updated = await database.update_one("users", existing["id"], updates)
        return updated or existing

    user = {
        "id": new_id(),
        "phone": phone,
        "name": name or "LetsGoRide user",
        "city": "Harare",
        "role": role,
        "email_verified": False,
        "rating": 4.8,
        "token": token,
        "is_demo": False,
        "created_at": timestamp,
        "updated_at": timestamp,
    }
    return await database.insert_one("users", user)


async def create_email_user(
    name: str,
    email: str,
    password: str,
    city: Optional[str],
    role: str,
) -> Dict[str, Any]:
    normalized_email = normalize_email(email)
    validate_strong_password(password)
    existing = await find_user_by_email(normalized_email)
    timestamp = now_iso()
    token = f"acct_{new_id()}"
    password_record = create_password_record(password)

    if existing:
        if existing.get("email_verified"):
            raise DuplicateVerifiedEmailError("This email already has an account. Please log in or reset your password.")
        raise ExistingUnverifiedEmailError("This account is waiting for email verification.")

    user = {
        "id": new_id(),
        "phone": "",
        "email": normalized_email,
        "name": name,
        "city": city or "Harare",
        "role": role,
        "email_verified": False,
        "email_verified_at": None,
        "rating": 4.8,
        "token": token,
        **password_record,
        "status": "active",
        "is_demo": False,
        "created_at": timestamp,
        "updated_at": timestamp,
        "notification_trip_updates": True,
        "notification_booking_requests": True,
        "notification_support_replies": True,
        "notification_safety_alerts": True,
        "notification_marketing": False,
    }
    created = await database.insert_one("users", user)
    return await start_email_verification(created, force=True)


async def verify_email_user(email: str, password: str) -> Optional[Dict[str, Any]]:
    user = await find_user_by_email(email)
    if not user:
        return None
    password_salt = user.get("password_salt")
    password_hash = user.get("password_hash")
    if not password_salt or not password_hash:
        return None
    if password_hash != hash_password(password, password_salt):
        return None
    if not user.get("email_verified", False):
        raise PermissionError("Please verify your email before logging in.")

    updated = await database.update_one(
        "users",
        user["id"],
        {"token": f"acct_{new_id()}", "updated_at": now_iso()},
    )
    return updated or user


async def verify_email_code(email: str, code: str) -> Optional[Dict[str, Any]]:
    user = await find_user_by_email(email)
    if not user:
        return None
    if user.get("email_verified"):
        return user
    attempts = int(user.get("email_verification_attempts", 0))
    if attempts >= 5:
        return None
    settings = get_settings()
    local_mock_allowed = settings.app_env != "production" and code == settings.mock_otp
    if not local_mock_allowed and (not code_not_expired(user) or not code_matches(user, code)):
        await database.update_one(
            "users",
            user["id"],
            {"email_verification_attempts": attempts + 1, "updated_at": now_iso()},
        )
        return None

    updated = await database.update_one(
        "users",
        user["id"],
        {
            "email_verified": True,
            "email_verified_at": now_iso(),
            "email_verification_code_hash": "",
            "email_verification_salt": "",
            "email_verification_attempts": 0,
            "token": f"acct_{new_id()}",
            "updated_at": now_iso(),
        },
    )
    return updated or user


async def resend_email_verification(email: str) -> Optional[Dict[str, Any]]:
    user = await find_user_by_email(email)
    if not user:
        return None
    if user.get("email_verified"):
        return user
    return await start_email_verification(user, force=True)


async def start_password_reset(email: str) -> None:
    user = await find_user_by_email(email)
    if not user:
        return
    now = datetime.now(timezone.utc)
    code = generate_email_code()
    updates = {
        **create_code_record(code, "reset"),
        "reset_expires_at": (now + timedelta(minutes=15)).isoformat(),
        "reset_attempts": 0,
        "reset_sent_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }
    updated = await database.update_one("users", user["id"], updates) or {**user, **updates}
    sent = await send_password_reset_email(updated["email"], code)
    if not sent:
        raise RuntimeError("Password reset code could not be sent.")


async def reset_email_password(email: str, code: str, password: str) -> bool:
    validate_strong_password(password)
    user = await find_user_by_email(email)
    if not user:
        return True
    attempts = int(user.get("reset_attempts", 0))
    if attempts >= 5:
        return False
    settings = get_settings()
    local_mock_allowed = settings.app_env != "production" and code == settings.mock_otp
    if not local_mock_allowed and (not code_not_expired(user, "reset") or not code_matches(user, code, "reset")):
        await database.update_one(
            "users",
            user["id"],
            {"reset_attempts": attempts + 1, "updated_at": now_iso()},
        )
        return False

    password_record = create_password_record(password)
    await database.update_one(
        "users",
        user["id"],
        {
            **password_record,
            "reset_code_hash": "",
            "reset_salt": "",
            "reset_attempts": 0,
            "reset_expires_at": None,
            "updated_at": now_iso(),
        },
    )
    return True


async def ensure_admin_seed_user() -> None:
    settings = get_settings()
    if not settings.admin_auto_create or not settings.admin_seed_email or not settings.admin_seed_password:
        return

    email = settings.admin_seed_email.lower().strip()
    timestamp = now_iso()
    password_record = create_password_record(settings.admin_seed_password)
    existing = await find_user_by_email(email)

    if existing:
        await database.update_one(
            "users",
            existing["id"],
            {
                "role": "admin",
                "name": existing.get("name") or "LetsGoRide Admin",
                "email": email,
                "email_verified": True,
                "email_verified_at": existing.get("email_verified_at") or timestamp,
                "status": "active",
                **password_record,
                "updated_at": timestamp,
            },
        )
        return

    user = {
        "id": new_id(),
        "phone": "",
        "email": email,
        "name": "LetsGoRide Admin",
        "city": "Harare",
        "role": "admin",
        "rating": 5,
        "token": "",
        "status": "active",
        "email_verified": True,
        "email_verified_at": timestamp,
        **password_record,
        "is_demo": False,
        "created_at": timestamp,
        "updated_at": timestamp,
    }
    await database.insert_one("users", user)
