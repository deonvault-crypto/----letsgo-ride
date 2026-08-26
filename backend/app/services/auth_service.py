import hashlib
import hmac
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from app.config import get_settings
from app.database import database
from app.models.user import normalize_email, validate_strong_password
from app.services.email_service import send_password_reset_email, send_verification_email
from app.utils import new_id, now_iso
from pymongo.errors import DuplicateKeyError


logger = logging.getLogger(__name__)

LEGACY_PBKDF2_ITERATIONS = 120_000
# Local release-gate benchmark: ~485 ms at 310k versus ~1.16 s at 600k.
# This raises legacy cost materially without making the async API an easy CPU bottleneck.
CURRENT_PBKDF2_ITERATIONS = 310_000
CURRENT_PASSWORD_SCHEME = "pbkdf2_sha256"


class DuplicateVerifiedEmailError(Exception):
    pass


class ExistingUnverifiedEmailError(Exception):
    pass


PUBLIC_VERIFICATION_STATUSES = {
    "not_started",
    "pending_uploads",
    "pending_auto_check",
    "needs_review",
    "approved",
    "rejected",
    "needs_resubmission",
}

PUBLIC_VERIFICATION_STATUS_ALIASES = {
    "active": "approved",
    "pending": "pending_uploads",
    "verified": "approved",
}


async def find_user_by_phone(phone: str) -> Optional[Dict[str, Any]]:
    return await database.find_one("users", {"phone": phone})


async def find_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    normalized = normalize_email(email)
    return await database.find_one("users", {"normalized_email": normalized}) or await database.find_one("users", {"email": normalized})


async def find_user_by_pending_email(email: str) -> Optional[Dict[str, Any]]:
    return await database.find_one("users", {"pending_email": normalize_email(email)})


async def find_user_by_token(token: str) -> Optional[Dict[str, Any]]:
    user = await database.find_one("users", {"token": token})
    if not user or user.get("status") in {"deleted", "suspended"}:
        return None
    expires_at = user.get("token_expires_at")
    if not expires_at:
        return None
    try:
        if datetime.fromisoformat(str(expires_at)) <= datetime.now(timezone.utc):
            return None
    except ValueError:
        return None
    return user


def public_user(user: Dict[str, Any]) -> Dict[str, Any]:
    hidden = {
        "password_hash",
        "password_salt",
        "password_scheme",
        "password_iterations",
        "email_verification_code_hash",
        "email_verification_salt",
        "reset_code_hash",
        "reset_code_salt",
        "reset_salt",
        "token",
        "token_issued_at",
        "token_expires_at",
        "sessions_revoked_at",
        "normalized_email",
    }
    public = {key: value for key, value in user.items() if key not in hidden}
    if public.get("verification_provider"):
        public["verification_provider"] = "manual"
    status = str(public.get("verification_status") or "").strip().lower().replace("-", "_").replace(" ", "_")
    public["verification_status"] = PUBLIC_VERIFICATION_STATUS_ALIASES.get(status, status)
    if public.get("verification_status") not in PUBLIC_VERIFICATION_STATUSES:
        public["verification_status"] = "not_started"
    return public


def hash_password(password: str, salt: str, iterations: int = LEGACY_PBKDF2_ITERATIONS) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        iterations,
    ).hex()


def create_password_record(password: str) -> Dict[str, Any]:
    salt = secrets.token_hex(16)
    return {
        "password_salt": salt,
        "password_hash": hash_password(password, salt, CURRENT_PBKDF2_ITERATIONS),
        "password_scheme": CURRENT_PASSWORD_SCHEME,
        "password_iterations": CURRENT_PBKDF2_ITERATIONS,
    }


def password_matches(user: Dict[str, Any], password: str) -> bool:
    salt = str(user.get("password_salt") or "")
    expected = str(user.get("password_hash") or "")
    if not salt or not expected:
        return False
    scheme = str(user.get("password_scheme") or CURRENT_PASSWORD_SCHEME)
    if scheme != CURRENT_PASSWORD_SCHEME:
        return False
    try:
        iterations = int(user.get("password_iterations") or LEGACY_PBKDF2_ITERATIONS)
    except (TypeError, ValueError):
        return False
    if iterations < LEGACY_PBKDF2_ITERATIONS or iterations > 2_000_000:
        return False
    actual = hash_password(password, salt, iterations)
    return hmac.compare_digest(expected, actual)


def password_needs_upgrade(user: Dict[str, Any]) -> bool:
    return (
        user.get("password_scheme") != CURRENT_PASSWORD_SCHEME
        or int(user.get("password_iterations") or LEGACY_PBKDF2_ITERATIONS) < CURRENT_PBKDF2_ITERATIONS
    )


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


def create_session_record(prefix: str = "acct") -> Dict[str, str]:
    now = datetime.now(timezone.utc)
    return {
        "token": f"{prefix}_{new_id()}",
        "token_issued_at": now.isoformat(),
        "token_expires_at": (now + timedelta(days=get_settings().session_lifetime_days)).isoformat(),
    }


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
    delivery_email = updated.get("pending_email") or updated["email"]
    sent = await send_verification_email(delivery_email, code)
    if not sent:
        settings = get_settings()
        if settings.staging_email_mock_allowed:
            logger.warning(
                "Email delivery unavailable in non-production; explicit staging mock verification fallback is active."
            )
            return updated
        raise RuntimeError("Email verification could not be sent.")
    return updated


async def create_or_update_user(phone: str, role: str, name: Optional[str] = None) -> Dict[str, Any]:
    existing = await find_user_by_phone(phone)
    session = create_session_record("auth")
    timestamp = now_iso()

    if existing:
        updates = {
            # Authentication refreshes a session; it never changes product
            # privileges supplied by an existing account record.
            "role": existing.get("role", "passenger"),
            **session,
            "updated_at": timestamp,
        }
        updated = await database.update_one("users", existing["id"], updates)
        return updated or existing

    user = {
        "id": new_id(),
        "phone": phone,
        "name": name or "LetsGoRide user",
        "city": "Harare",
        "role": "passenger",
        "email_verified": False,
        "rating": 0,
        **session,
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
    password_record = create_password_record(password)

    if existing:
        if existing.get("email_verified"):
            raise DuplicateVerifiedEmailError("This email already has an account. Please log in or reset your password.")
        raise ExistingUnverifiedEmailError("This account is waiting for email verification.")

    user = {
        "id": new_id(),
        "phone": "",
        "email": normalized_email,
        "normalized_email": normalized_email,
        "name": name,
        "city": city or "Harare",
        # This service backs public registration only. Work product access is
        # provisioned by an audited administrator action after identity creation.
        "role": "passenger",
        "email_verified": False,
        "email_verified_at": None,
        "rating": 0,
        **create_session_record(),
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
    try:
        created = await database.insert_one("users", user)
    except DuplicateKeyError as exc:
        raise DuplicateVerifiedEmailError("This email already has an account. Please log in or reset your password.") from exc
    return await start_email_verification(created, force=True)


async def verify_email_user(email: str, password: str) -> Optional[Dict[str, Any]]:
    user = await find_user_by_email(email)
    if not user:
        return None
    if not password_matches(user, password):
        return None
    if not user.get("email_verified", False):
        raise PermissionError("Please verify your email before logging in.")

    credential_upgrade = create_password_record(password) if password_needs_upgrade(user) else {}
    updated = await database.update_one(
        "users",
        user["id"],
        {**credential_upgrade, **create_session_record(), "updated_at": now_iso()},
    )
    return updated or user


async def verify_email_code(email: str, code: str) -> Optional[Dict[str, Any]]:
    normalized = normalize_email(email)
    user = await find_user_by_email(normalized) or await find_user_by_pending_email(normalized)
    if not user:
        return None
    changing_email = user.get("pending_email") == normalized
    if user.get("email_verified") and not changing_email:
        # Verification is not a login endpoint. Never disclose an existing session.
        return {**user, "token": ""}
    attempts = int(user.get("email_verification_attempts", 0))
    if attempts >= 5:
        return None
    settings = get_settings()
    local_mock_allowed = settings.mock_otp_allowed and code == settings.mock_otp
    if not local_mock_allowed and (not code_not_expired(user) or not code_matches(user, code)):
        await database.update_one(
            "users",
            user["id"],
            {"email_verification_attempts": attempts + 1, "updated_at": now_iso()},
        )
        return None

    updates = {
        "email_verified": True,
        "email_verified_at": now_iso(),
        "email_verification_code_hash": "",
        "email_verification_salt": "",
        "email_verification_attempts": 0,
        **create_session_record(),
        "updated_at": now_iso(),
    }
    if changing_email:
        updates.update({
            "email": normalized,
            "normalized_email": normalized,
            "pending_email": None,
        })
    try:
        updated = await database.update_one("users", user["id"], updates)
    except DuplicateKeyError:
        return None
    return updated or user


async def resend_email_verification(email: str) -> Optional[Dict[str, Any]]:
    normalized = normalize_email(email)
    user = await find_user_by_email(normalized) or await find_user_by_pending_email(normalized)
    if not user:
        return None
    if user.get("email_verified") and user.get("pending_email") != normalized:
        return user
    return await start_email_verification(user, force=False)


async def start_password_reset(email: str) -> None:
    user = await find_user_by_email(email)
    if not user:
        return
    now = datetime.now(timezone.utc)
    last_sent = user.get("reset_sent_at")
    if last_sent:
        try:
            if datetime.fromisoformat(str(last_sent)) + timedelta(seconds=60) > now:
                return
        except ValueError:
            pass
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
    local_mock_allowed = settings.mock_otp_allowed and code == settings.mock_otp
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
            "token": "",
            "token_issued_at": None,
            "token_expires_at": None,
            "sessions_revoked_at": now_iso(),
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
    existing = await find_user_by_email(email)

    if existing:
        existing_password_matches = password_matches(existing, settings.admin_seed_password)
        credential_updates: Dict[str, Any] = {}
        if not existing_password_matches:
            credential_updates = {
                **create_password_record(settings.admin_seed_password),
                "token": "",
                "token_issued_at": None,
                "token_expires_at": None,
                "sessions_revoked_at": timestamp,
            }
        elif password_needs_upgrade(existing):
            credential_updates = create_password_record(settings.admin_seed_password)
        await database.update_one(
            "users",
            existing["id"],
            {
                "role": "admin",
                "name": existing.get("name") or "LetsGoRide Admin",
                "email": email,
                "normalized_email": email,
                "email_verified": True,
                "email_verified_at": existing.get("email_verified_at") or timestamp,
                "status": "active",
                **credential_updates,
                "updated_at": timestamp,
            },
        )
        return

    user = {
        "id": new_id(),
        "phone": "",
        "email": email,
        "normalized_email": email,
        "name": "LetsGoRide Admin",
        "city": "Harare",
        "role": "admin",
        "rating": 5,
        "token": "",
        "token_issued_at": None,
        "token_expires_at": None,
        "status": "active",
        "email_verified": True,
        "email_verified_at": timestamp,
        **create_password_record(settings.admin_seed_password),
        "is_demo": False,
        "created_at": timestamp,
        "updated_at": timestamp,
    }
    await database.insert_one("users", user)
