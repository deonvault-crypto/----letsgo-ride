from __future__ import annotations

from pathlib import Path
import re

from PIL import Image, ImageDraw, ImageFilter


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one match, found {count}: {old[:100]!r}")
    write(path, text.replace(old, new, 1))


# -----------------------------------------------------------------------------
# Production configuration: only local development/test and production exist.
# Production is pinned to the real database and durable Cloudinary storage.
# -----------------------------------------------------------------------------
p = "backend/app/config.py"
text = read(p)
old = (
    '        self.app_env = os.getenv("APP_ENV", "development")\n'
    '        self.mongodb_uri = os.getenv("MONGODB_URI", "").strip()\n'
    '        self.mongodb_db_name = os.getenv("MONGODB_DB_NAME", "letsgoride")\n'
    '        self.mock_otp = os.getenv("MOCK_OTP", "").strip()\n'
)
new = (
    '        self.app_env = os.getenv("APP_ENV", "development").strip().lower() or "development"\n'
    '        if self.app_env not in {"development", "test", "production"}:\n'
    '            raise RuntimeError("Unsupported APP_ENV. Use development, test, or production.")\n'
    '        self.mongodb_uri = os.getenv("MONGODB_URI", "").strip()\n'
    '        self.mongodb_db_name = os.getenv("MONGODB_DB_NAME", "letsgoride").strip() or "letsgoride"\n'
    '        if self.is_production and self.mongodb_db_name != "letsgoride":\n'
    '            raise RuntimeError("Production MONGODB_DB_NAME must be exactly letsgoride.")\n'
)
if text.count(old) != 1:
    raise SystemExit("config.py: environment/database block did not match exactly")
text = text.replace(old, new, 1)
cloud_anchor = '        self.cloudinary_api_secret = self._get_env_first("CLOUDINARY_API_SECRET") or cloudinary_url_config.get("api_secret", "")\n'
if text.count(cloud_anchor) != 1:
    raise SystemExit("config.py: Cloudinary anchor missing")
text = text.replace(
    cloud_anchor,
    cloud_anchor
    + '        self.cloudinary_configured = bool(self.cloudinary_cloud_name and self.cloudinary_api_key and self.cloudinary_api_secret)\n'
    + '        if self.is_production and not self.cloudinary_configured:\n'
    + '            raise RuntimeError("Production Cloudinary storage credentials must be configured.")\n',
    1,
)
text, removed = re.subn(
    r'\n    @property\n    def mock_otp_allowed\(self\) -> bool:\n        return bool\(self\.mock_otp\) and self\.app_env\.strip\(\)\.lower\(\) in \{"development", "test"\}\n',
    "\n",
    text,
    count=1,
)
if removed != 1:
    raise SystemExit("config.py: retired mock OTP property not found")
write(p, text)


# -----------------------------------------------------------------------------
# MongoDB: only production requires persistence; remove demo-specific index key.
# -----------------------------------------------------------------------------
replace_once(
    "backend/app/database.py",
    'PERSISTENT_DATABASE_ENVS = {"staging", "production"}',
    'PERSISTENT_DATABASE_ENVS = {"production"}',
)
replace_once(
    "backend/app/database.py",
    '        await self.db["rides"].create_index(\n'
    '            [("status", 1), ("is_demo", 1), ("updated_at", -1)],\n'
    '            name="admin_rides_by_status",\n'
    '        )',
    '        await self.db["rides"].create_index(\n'
    '            [("status", 1), ("updated_at", -1)],\n'
    '            name="admin_rides_by_status",\n'
    '        )',
)


# -----------------------------------------------------------------------------
# Ride Now geography: remove the retired non-production geography escape hatch.
# -----------------------------------------------------------------------------
p = "backend/app/services/hailing_city_service.py"
text = read(p)
if text.count('STAGING_EXTERNAL_TEST_CITY_ID = "zw-harare"\n') != 1:
    raise SystemExit("hailing_city_service.py: retired city constant missing")
text = text.replace('STAGING_EXTERNAL_TEST_CITY_ID = "zw-harare"\n', "", 1)
text, count = re.subn(
    r'\nasync def _staging_external_service_area\(\) -> Optional\[Dict\[str, Any\]\]:\n.*?\n\nasync def resolve_service_area',
    "\nasync def resolve_service_area",
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit("hailing_city_service.py: retired geography helper removal failed")
old = (
    '    if not is_in_zimbabwe(latitude, longitude):\n'
    '        staging_area = await _staging_external_service_area()\n'
    '        if staging_area is not None:\n'
    '            return staging_area\n'
    '        return {"supported": False, "enabled": False, "reason": "outside_zimbabwe", "service_area": None, "ride_classes": []}\n'
)
new = (
    '    if not is_in_zimbabwe(latitude, longitude):\n'
    '        return {"supported": False, "enabled": False, "reason": "outside_zimbabwe", "service_area": None, "ride_classes": []}\n'
)
if text.count(old) != 1:
    raise SystemExit("hailing_city_service.py: outside-Zimbabwe branch missing")
write(p, text.replace(old, new, 1))


# -----------------------------------------------------------------------------
# Intercity rides: legacy sample/demo data is physically gone, so remove all
# runtime demo semantics and admin cleanup/filter behavior.
# -----------------------------------------------------------------------------
p = "backend/app/services/ride_service.py"
text = read(p)
text, count = re.subn(r'\nLEGACY_DEMO_RIDE_SIGNATURES = \{.*?\n\}\n', "\n", text, count=1, flags=re.S)
if count != 1:
    raise SystemExit("ride_service.py: legacy sample signatures not removed")
text, count = re.subn(
    r'\ndef is_legacy_demo_ride\(ride: Dict\[str, Any\]\) -> bool:\n.*?\ndef ride_departure_datetime',
    "\ndef ride_departure_datetime",
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit("ride_service.py: legacy sample helper block not removed")
if text.count('        if not is_public_ride(ride):\n            continue\n') != 1:
    raise SystemExit("ride_service.py: lifecycle legacy filter missing")
text = text.replace('        if not is_public_ride(ride):\n            continue\n', "", 1)
if text.count('        is_public_ride(ride)\n        and public_ride_status(ride) == TRIP_STATUS_SCHEDULED\n') != 1:
    raise SystemExit("ride_service.py: bookability legacy filter missing")
text = text.replace(
    '        is_public_ride(ride)\n        and public_ride_status(ride) == TRIP_STATUS_SCHEDULED\n',
    '        public_ride_status(ride) == TRIP_STATUS_SCHEDULED\n',
    1,
)
text, count = re.subn(
    r'\nasync def cleanup_demo_rides\(\) -> Dict\[str, int\]:\n.*?\n\nasync def create_ride',
    "\n\nasync def create_ride",
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit("ride_service.py: retired cleanup helper not removed")
write(p, text)

# Remove `is_demo=False` record metadata everywhere in production runtime.
for path in Path("backend/app").rglob("*.py"):
    source = path.read_text(encoding="utf-8")
    updated = re.sub(r'^\s*"is_demo": False,\n', "", source, flags=re.M)
    updated = updated.replace(', "is_demo": False,', ',')
    if updated != source:
        path.write_text(updated, encoding="utf-8")

p = "backend/app/routers/admin.py"
text = read(p)
if text.count(", cleanup_demo_rides,") != 1:
    raise SystemExit("admin.py: cleanup import missing")
text = text.replace(", cleanup_demo_rides,", ",", 1)
text, count = re.subn(
    r'\n\ndef _is_real_ride\(ride: Dict\[str, Any\]\) -> bool:\n    return ride\.get\("is_demo"\) is not True\n',
    "",
    text,
    count=1,
)
if count != 1:
    raise SystemExit("admin.py: legacy ride filter helper not removed")
text = text.replace('database.count("rides", {"is_demo": {"$ne": True}})', 'database.count("rides")')
text = text.replace(
    'database.count("rides", {"is_demo": {"$ne": True}, "status": {"$in": active_ride_statuses}})',
    'database.count("rides", {"status": {"$in": active_ride_statuses}})',
)
text = text.replace(
    '    rides = [ride for ride in await database.find_many("rides") if _is_real_ride(ride)]',
    '    rides = await database.find_many("rides")',
)
text = text.replace('    if not ride or not _is_real_ride(ride):', '    if not ride:')
text, count = re.subn(
    r'\n\n@router\.delete\("/rides/demo"\)\nasync def delete_demo_rides\(admin=Depends\(get_admin_user\)\):\n.*?\n    return api_success\(result\)\n?',
    "\n",
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit("admin.py: retired cleanup endpoint not removed")
write(p, text)


# -----------------------------------------------------------------------------
# Authentication: remove all mock credential bypasses. Legacy phone endpoints
# stay URL-compatible but fail closed until a real SMS provider is implemented.
# -----------------------------------------------------------------------------
p = "backend/app/services/auth_service.py"
text = read(p)
old = (
    '    settings = get_settings()\n'
    '    local_mock_allowed = settings.mock_otp_allowed and code == settings.mock_otp\n'
    '    if not local_mock_allowed and (not code_not_expired(user) or not code_matches(user, code)):\n'
)
if text.count(old) != 1:
    raise SystemExit("auth_service.py: email verification mock bypass missing")
text = text.replace(old, '    if not code_not_expired(user) or not code_matches(user, code):\n', 1)
old = (
    '    settings = get_settings()\n'
    '    local_mock_allowed = settings.mock_otp_allowed and code == settings.mock_otp\n'
    '    if not local_mock_allowed and (not code_not_expired(user, "reset") or not code_matches(user, code, "reset")):\n'
)
if text.count(old) != 1:
    raise SystemExit("auth_service.py: password reset mock bypass missing")
text = text.replace(old, '    if not code_not_expired(user, "reset") or not code_matches(user, code, "reset"):\n', 1)
write(p, text)

p = "backend/app/routers/auth.py"
text = read(p)
text, count = re.subn(
    r'@router\.post\("/request-otp"\)\nasync def request_otp\(payload: RequestOtpBody, request: Request\):\n.*?\n\n@router\.post\("/verify-otp"\)',
    '@router.post("/request-otp")\n'
    'async def request_otp(payload: RequestOtpBody, request: Request):\n'
    '    await rate_limit_service.enforce(request, "auth-otp-send", RateLimit(5, 3600), identity=payload.phone)\n'
    '    api_error("Phone verification is not available. Use secure email sign-in.", 503)\n\n\n'
    '@router.post("/verify-otp")',
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit("auth.py: request OTP block patch failed")
text, count = re.subn(
    r'@router\.post\("/verify-otp"\)\nasync def verify_otp\(payload: VerifyOtpBody, request: Request\):\n.*?\n\n@router\.post\("/register"\)',
    '@router.post("/verify-otp")\n'
    'async def verify_otp(payload: VerifyOtpBody, request: Request):\n'
    '    await rate_limit_service.enforce(request, "auth-otp-verify", RateLimit(10, 900), identity=payload.phone)\n'
    '    api_error("Phone verification is not available. Use secure email sign-in.", 503)\n\n\n'
    '@router.post("/register")',
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit("auth.py: verify OTP block patch failed")
text, count = re.subn(
    r'@router\.post\("/register"\)\nasync def register\(payload: RegisterBody, request: Request\):\n.*?\n\n@router\.post\("/email-register"\)',
    '@router.post("/register")\n'
    'async def register(payload: RegisterBody, request: Request):\n'
    '    await rate_limit_service.enforce(request, "auth-register", RateLimit(5, 3600), identity=payload.phone)\n'
    '    api_error("Phone registration is not available. Use secure email sign-up.", 503)\n\n\n'
    '@router.post("/email-register")',
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit("auth.py: legacy phone registration block patch failed")
write(p, text)


# -----------------------------------------------------------------------------
# Durable profile-photo storage. Cloudinary is public CDN storage for profile
# photos; local disk remains only as a development/test fallback and can never
# be selected in production because Settings requires Cloudinary there.
# -----------------------------------------------------------------------------
profile_service = '''from __future__ import annotations

import asyncio
import io
import logging
from pathlib import Path
from typing import Any, Dict

import cloudinary
import cloudinary.uploader
from fastapi import UploadFile

from app.config import get_settings
from app.database import database
from app.services.notification_service import notify_admins
from app.services.upload_security_service import validate_upload
from app.utils import new_id, now_iso


logger = logging.getLogger(__name__)
STORAGE_ROOT = Path(__file__).resolve().parents[2] / "storage" / "profile_photos"
WORKER_ROLES_REQUIRING_REVIEW = {"driver", "courier"}


class ProfilePhotoUploadError(RuntimeError):
    def __init__(self, message: str, status_code: int = 503) -> None:
        super().__init__(message)
        self.status_code = status_code


def absolute_profile_photo_url(relative_url: str) -> str:
    if relative_url.startswith("http://") or relative_url.startswith("https://"):
        return relative_url
    base_url = getattr(get_settings(), "public_api_base_url", "").rstrip("/")
    return f"{base_url}{relative_url}" if base_url else relative_url


def _cloudinary_configured() -> bool:
    settings = get_settings()
    return bool(
        getattr(settings, "cloudinary_configured", False)
        or (
            getattr(settings, "cloudinary_cloud_name", "")
            and getattr(settings, "cloudinary_api_key", "")
            and getattr(settings, "cloudinary_api_secret", "")
        )
    )


def _configure_cloudinary() -> bool:
    if not _cloudinary_configured():
        return False
    settings = get_settings()
    cloudinary.config(
        cloud_name=settings.cloudinary_cloud_name,
        api_key=settings.cloudinary_api_key,
        api_secret=settings.cloudinary_api_secret,
        secure=True,
    )
    return True


def _upload_profile_photo(file_bytes: bytes, file_name: str, user_id: str) -> Dict[str, Any]:
    if not _configure_cloudinary():
        raise ProfilePhotoUploadError("Durable profile-photo storage is not configured.")
    file_obj = io.BytesIO(file_bytes)
    file_obj.name = file_name
    try:
        result = cloudinary.uploader.upload(
            file_obj,
            resource_type="image",
            type="upload",
            folder=f"letsgoride/profile-photos/{user_id}",
            use_filename=False,
            unique_filename=True,
            overwrite=False,
        )
    except Exception as exc:
        logger.warning("profile_photo_upload provider=cloudinary status=failed error_type=%s", type(exc).__name__)
        raise ProfilePhotoUploadError("Profile photo could not be stored securely. Please try again.") from exc
    if not result.get("secure_url") or not result.get("public_id"):
        raise ProfilePhotoUploadError("Profile photo storage returned an incomplete result. Please try again.")
    return result


def _destroy_profile_photo(public_id: str) -> None:
    if not public_id or not _configure_cloudinary():
        return
    try:
        cloudinary.uploader.destroy(public_id, resource_type="image", type="upload", invalidate=True)
    except Exception as exc:
        logger.warning("profile_photo_cleanup provider=cloudinary status=failed error_type=%s", type(exc).__name__)


async def delete_profile_photo_asset(public_id: str | None) -> None:
    if public_id:
        await asyncio.to_thread(_destroy_profile_photo, public_id)


def _local_development_photo(user_id: str, data: bytes) -> Dict[str, Any]:
    user_dir = STORAGE_ROOT / user_id
    user_dir.mkdir(parents=True, exist_ok=True)
    file_name = f"{new_id()}_profile-photo.jpg"
    (user_dir / file_name).write_bytes(data)
    return {
        "secure_url": absolute_profile_photo_url(f"/media/profile-photos/{user_id}/{file_name}"),
        "public_id": None,
        "resource_type": "image",
        "type": "local-development",
        "version": None,
    }


async def save_profile_photo(user: Dict[str, Any], upload: UploadFile) -> Dict[str, Any]:
    validated = await validate_upload(
        upload,
        max_bytes=4 * 1024 * 1024,
        allow_pdf=False,
        stem="profile-photo",
        max_image_edge=1280,
    )
    settings = get_settings()
    if _cloudinary_configured():
        stored = await asyncio.to_thread(
            _upload_profile_photo,
            validated.data,
            validated.file_name,
            user["id"],
        )
    elif getattr(settings, "is_production", False):
        raise ProfilePhotoUploadError("Durable profile-photo storage is unavailable.")
    else:
        stored = _local_development_photo(user["id"], validated.data)

    absolute_url = str(stored["secure_url"])
    public_id = stored.get("public_id")
    timestamp = now_iso()
    role = str(user.get("role") or "passenger")
    provider_fields = {
        "url": absolute_url,
        "cloudinary_public_id": public_id,
        "resource_type": stored.get("resource_type") or "image",
        "delivery_type": stored.get("type") or "upload",
        "version": stored.get("version"),
    }

    if role in WORKER_ROLES_REQUIRING_REVIEW:
        updates = {
            "profile_photo_pending_url": provider_fields["url"],
            "profile_photo_pending_cloudinary_public_id": provider_fields["cloudinary_public_id"],
            "profile_photo_pending_resource_type": provider_fields["resource_type"],
            "profile_photo_pending_delivery_type": provider_fields["delivery_type"],
            "profile_photo_pending_version": provider_fields["version"],
            "profile_photo_pending_name": upload.filename or validated.file_name,
            "profile_photo_review_status": "pending",
            "profile_photo_rejection_reason": None,
            "profile_photo_submitted_at": timestamp,
            "profile_photo_reviewed_at": None,
            "profile_photo_reviewed_by": None,
            "updated_at": timestamp,
        }
        if user.get("profile_photo_verified") is not True:
            updates["profile_photo_verified"] = False
        try:
            updated = await database.update_one("users", user["id"], updates)
            if not updated:
                raise RuntimeError("User record was not found after profile-photo upload.")
        except Exception as exc:
            await delete_profile_photo_asset(public_id)
            raise ProfilePhotoUploadError(
                "Profile photo was stored but could not be attached to the account. Please try again."
            ) from exc
        try:
            await notify_admins(
                "worker_profile_photo",
                "Worker photo needs review",
                f"{user.get('name') or 'A worker'} submitted a {role.title()} profile photo.",
                {
                    "user_id": user["id"],
                    "worker_role": role,
                    "notification_target": "admin_worker_profile_photo",
                },
            )
        except Exception as exc:
            logger.warning("profile_photo_upload admin_notification=failed error_type=%s", type(exc).__name__)
        return updated

    updates = {
        "profile_photo_url": provider_fields["url"],
        "profile_photo_cloudinary_public_id": provider_fields["cloudinary_public_id"],
        "profile_photo_resource_type": provider_fields["resource_type"],
        "profile_photo_delivery_type": provider_fields["delivery_type"],
        "profile_photo_version": provider_fields["version"],
        "profile_photo_name": upload.filename or validated.file_name,
        "profile_photo_verified": False,
        "profile_photo_review_status": "not_required",
        "updated_at": timestamp,
    }
    old_public_id = user.get("profile_photo_cloudinary_public_id")
    try:
        updated = await database.update_one("users", user["id"], updates)
        if not updated:
            raise RuntimeError("User record was not found after profile-photo upload.")
    except Exception as exc:
        await delete_profile_photo_asset(public_id)
        raise ProfilePhotoUploadError(
            "Profile photo was stored but could not be attached to the account. Please try again."
        ) from exc
    if old_public_id and old_public_id != public_id:
        await delete_profile_photo_asset(str(old_public_id))
    return updated
'''
write("backend/app/services/profile_photo_service.py", profile_service)

# Safe API error propagation for profile storage provider failures.
p = "backend/app/routers/auth.py"
text = read(p)
replace_import = "from app.services.profile_photo_service import save_profile_photo"
if text.count(replace_import) != 1:
    raise SystemExit("auth.py: profile service import not found")
text = text.replace(
    replace_import,
    "from app.services.profile_photo_service import ProfilePhotoUploadError, save_profile_photo",
    1,
)
old = (
    '    except ValueError as error:\n'
    '        api_error(str(error), 400)\n'
    '    return api_success(public_user(updated))'
)
new = (
    '    except ValueError as error:\n'
    '        api_error(str(error), 400)\n'
    '    except ProfilePhotoUploadError as error:\n'
    '        api_error(str(error), error.status_code)\n'
    '    return api_success(public_user(updated))'
)
if text.count(old) != 1:
    raise SystemExit("auth.py: profile upload error block not found")
write(p, text.replace(old, new, 1))

# Admin moderation transfers provider metadata and cleans rejected/replaced assets.
p = "backend/app/routers/admin_profile_photos.py"
text = read(p)
if text.count("from app.services.notification_service import create_app_notification\n") != 1:
    raise SystemExit("admin_profile_photos.py: notification import anchor missing")
text = text.replace(
    "from app.services.notification_service import create_app_notification\n",
    "from app.services.notification_service import create_app_notification\n"
    "from app.services.profile_photo_service import delete_profile_photo_asset\n",
    1,
)
old = (
    '            "candidate_name": user.get("profile_photo_pending_name"),\n'
    '            "review_status": user.get("profile_photo_review_status") or "pending",'
)
new = (
    '            "candidate_name": user.get("profile_photo_pending_name"),\n'
    '            "cloudinary_public_id": user.get("profile_photo_pending_cloudinary_public_id"),\n'
    '            "resource_type": user.get("profile_photo_pending_resource_type"),\n'
    '            "delivery_type": user.get("profile_photo_pending_delivery_type"),\n'
    '            "version": user.get("profile_photo_pending_version"),\n'
    '            "review_status": user.get("profile_photo_review_status") or "pending",'
)
if text.count(old) != 1:
    raise SystemExit("admin_profile_photos.py: pending candidate anchor missing")
text = text.replace(old, new, 1)
old = (
    '            "candidate_name": user.get("profile_photo_name"),\n'
    '            "review_status": user.get("profile_photo_review_status") or "pending",'
)
new = (
    '            "candidate_name": user.get("profile_photo_name"),\n'
    '            "cloudinary_public_id": user.get("profile_photo_cloudinary_public_id"),\n'
    '            "resource_type": user.get("profile_photo_resource_type"),\n'
    '            "delivery_type": user.get("profile_photo_delivery_type"),\n'
    '            "version": user.get("profile_photo_version"),\n'
    '            "review_status": user.get("profile_photo_review_status") or "pending",'
)
if text.count(old) != 1:
    raise SystemExit("admin_profile_photos.py: legacy candidate anchor missing")
text = text.replace(old, new, 1)
old = (
    '        "profile_photo_pending_url": None,\n'
    '        "profile_photo_pending_name": None,\n'
    '        "updated_at": timestamp,'
)
new = (
    '        "profile_photo_pending_url": None,\n'
    '        "profile_photo_pending_name": None,\n'
    '        "profile_photo_pending_cloudinary_public_id": None,\n'
    '        "profile_photo_pending_resource_type": None,\n'
    '        "profile_photo_pending_delivery_type": None,\n'
    '        "profile_photo_pending_version": None,\n'
    '        "updated_at": timestamp,'
)
if text.count(old) != 1:
    raise SystemExit("admin_profile_photos.py: pending clear anchor missing")
text = text.replace(old, new, 1)
old = (
    '                "profile_photo_name": candidate.get("candidate_name") or user.get("profile_photo_name"),\n'
    '                "profile_photo_verified": True,'
)
new = (
    '                "profile_photo_name": candidate.get("candidate_name") or user.get("profile_photo_name"),\n'
    '                "profile_photo_cloudinary_public_id": candidate.get("cloudinary_public_id"),\n'
    '                "profile_photo_resource_type": candidate.get("resource_type"),\n'
    '                "profile_photo_delivery_type": candidate.get("delivery_type"),\n'
    '                "profile_photo_version": candidate.get("version"),\n'
    '                "profile_photo_verified": True,'
)
if text.count(old) != 1:
    raise SystemExit("admin_profile_photos.py: approval metadata anchor missing")
text = text.replace(old, new, 1)
anchor = '    updated = await database.update_one("users", user_id, updates) or {**user, **updates}\n'
if text.count(anchor) != 1:
    raise SystemExit("admin_profile_photos.py: update anchor missing")
cleanup = (
    anchor
    + '    candidate_public_id = candidate.get("cloudinary_public_id")\n'
    + '    previous_public_id = user.get("profile_photo_cloudinary_public_id")\n'
    + '    if payload.status == "rejected" and candidate_public_id:\n'
    + '        await delete_profile_photo_asset(str(candidate_public_id))\n'
    + '    elif payload.status == "approved" and replacement and previous_public_id and previous_public_id != candidate_public_id:\n'
    + '        await delete_profile_photo_asset(str(previous_public_id))\n'
)
write(p, text.replace(anchor, cleanup, 1))

# Readiness includes durable profile storage without exposing provider secrets.
p = "backend/app/routers/health.py"
text = read(p)
old = '    payments_ready = stripe_runtime_ready()\n    core_ready = database_ready and realtime_ready\n'
new = (
    '    payments_ready = stripe_runtime_ready()\n'
    '    storage_ready = bool(getattr(settings, "cloudinary_configured", False)) if settings.is_production else True\n'
    '    core_ready = database_ready and realtime_ready and storage_ready\n'
)
if text.count(old) != 1:
    raise SystemExit("health.py: readiness anchor missing")
text = text.replace(old, new, 1)
old = '            "payments_status": "ready" if payments_ready else "degraded",\n'
new = old + '            "profile_storage_status": "ready" if storage_ready else "degraded",\n'
if text.count(old) != 1:
    raise SystemExit("health.py: payments status anchor missing")
write(p, text.replace(old, new, 1))


# -----------------------------------------------------------------------------
# Driver UX: make scheduled city-to-city product identity unmistakable.
# -----------------------------------------------------------------------------
replace_once(
    "mobile/components/layout/BottomNav.tsx",
    '{ label: "Trips", icon: "steering", href: "/(driver)/trips" },',
    '{ label: "Intercity", icon: "steering", href: "/(driver)/trips" },',
)

p = "mobile/app/(driver)/post-trip.tsx"
text = read(p)
for old, new in (
    ('<Screen navRole="driver" title="Post trip">', '<Screen navRole="driver" title="Post intercity ride">'),
    ('<Text style={styles.eyebrow}>SHARE A ROUTE</Text>', '<Text style={styles.eyebrow}>INTERCITY RIDE</Text>'),
    ('<Text style={styles.title}>Where are you driving?</Text>', '<Text style={styles.title}>Post an intercity route.</Text>'),
    (
        'Build the journey first. Seats, price and vehicle details follow the route.',
        'Scheduled rides between cities. Set the route first, then seats, fare and vehicle details.',
    ),
):
    if text.count(old) != 1:
        raise SystemExit(f"post-trip.tsx: missing label {old!r}")
    text = text.replace(old, new, 1)
write(p, text)

p = "mobile/app/(driver)/trips.tsx"
text = read(p)
for old, new in (
    ('<Screen title="Trips" navRole="driver">', '<Screen title="Intercity trips" navRole="driver">'),
    ('<Text style={styles.eyebrow}>YOUR ROAD</Text>', '<Text style={styles.eyebrow}>INTERCITY</Text>'),
    ('<Text style={styles.title}>Routes you’re driving.</Text>', '<Text style={styles.title}>Your intercity routes.</Text>'),
    (
        'Upcoming intercity trips and passenger-ready routes, without the dashboard clutter.',
        'Scheduled city-to-city trips you’re driving, kept separate from Ride Now.',
    ),
):
    if text.count(old) != 1:
        raise SystemExit(f"trips.tsx: missing label {old!r}")
    text = text.replace(old, new, 1)
write(p, text)

p = "mobile/app/(driver)/availability.tsx"
text = read(p)
for old, new in (
    ('<Screen navRole="driver" title="Calendar" showNotifications>', '<Screen navRole="driver" title="Intercity calendar" showNotifications>'),
    ('<Text style={styles.eyebrow}>DRIVING CALENDAR</Text>', '<Text style={styles.eyebrow}>INTERCITY CALENDAR</Text>'),
    (
        'Mark the windows you’re available. Your route planning stays separate from Ride Now’s live online status.',
        'Plan availability for scheduled intercity routes. This calendar stays separate from Ride Now’s live online status.',
    ),
):
    if text.count(old) != 1:
        raise SystemExit(f"availability.tsx: missing label {old!r}")
    text = text.replace(old, new, 1)
write(p, text)


# -----------------------------------------------------------------------------
# Clean premium Ride Now assets: keep valid Economy untouched; replace only the
# two corrupted binaries. Render at 4x, then downsample to clean 320x180 RGBA.
# -----------------------------------------------------------------------------
SCALE = 4
W, H = 320 * SCALE, 180 * SCALE
OUT = Path("mobile/assets/images/hailing")


def s(value: float) -> int:
    return int(round(value * SCALE))


def make_car(kind: str, body: tuple[int, int, int, int], accent: tuple[int, int, int, int], roof: tuple[int, int, int, int], filename: str) -> None:
    image = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.ellipse((s(42), s(132), s(282), s(160)), fill=(0, 0, 0, 52))
    shadow = shadow.filter(ImageFilter.GaussianBlur(s(7)))
    image.alpha_composite(shadow)
    d = ImageDraw.Draw(image)

    if kind == "comfort":
        body_polygon = [
            (s(35), s(116)), (s(48), s(96)), (s(92), s(89)), (s(126), s(61)),
            (s(205), s(58)), (s(247), s(88)), (s(282), s(96)), (s(294), s(116)),
            (s(286), s(134)), (s(42), s(134)),
        ]
        glass = [(s(104), s(87)), (s(133), s(65)), (s(199), s(64)), (s(232), s(87))]
        wheel_x = (86, 246)
    else:
        body_polygon = [
            (s(28), s(116)), (s(43), s(91)), (s(82), s(82)), (s(106), s(54)),
            (s(219), s(54)), (s(253), s(81)), (s(287), s(90)), (s(301), s(116)),
            (s(292), s(136)), (s(35), s(136)),
        ]
        glass = [(s(94), s(80)), (s(115), s(59)), (s(212), s(59)), (s(240), s(81))]
        wheel_x = (82, 252)

    d.polygon(body_polygon, fill=body)
    d.line([(s(46), s(101)), (s(276), s(101))], fill=accent, width=s(2))
    d.line([(s(56), s(126)), (s(275), s(126))], fill=(255, 255, 255, 46), width=s(1))
    d.polygon(glass, fill=roof)

    if kind == "comfort":
        d.line([(s(166), s(64)), (s(166), s(88))], fill=(175, 188, 198, 210), width=s(2))
        d.line([(s(123), s(88)), (s(118), s(120))], fill=(35, 42, 48, 150), width=s(2))
        d.line([(s(211), s(88)), (s(217), s(120))], fill=(35, 42, 48, 150), width=s(2))
    else:
        d.line([(s(145), s(59)), (s(145), s(81))], fill=(175, 188, 198, 210), width=s(2))
        d.line([(s(198), s(59)), (s(198), s(82))], fill=(175, 188, 198, 210), width=s(2))
        d.line([(s(117), s(82)), (s(112), s(122))], fill=(35, 42, 48, 150), width=s(2))
        d.line([(s(231), s(82)), (s(237), s(122))], fill=(35, 42, 48, 150), width=s(2))

    d.rounded_rectangle((s(151), s(99), s(166), s(102)), radius=s(1), fill=(235, 238, 240, 190))
    d.rounded_rectangle((s(208), s(99), s(223), s(102)), radius=s(1), fill=(235, 238, 240, 190))
    d.rounded_rectangle((s(279), s(104), s(294), s(112)), radius=s(3), fill=(242, 238, 215, 235))
    d.rounded_rectangle((s(31), s(108), s(45), s(117)), radius=s(3), fill=(178, 34, 42, 225))

    for x in wheel_x:
        d.ellipse((s(x - 22), s(115), s(x + 22), s(159)), fill=(21, 23, 26, 255))
        d.ellipse((s(x - 15), s(122), s(x + 15), s(152)), fill=(76, 82, 88, 255))
        d.ellipse((s(x - 9), s(128), s(x + 9), s(146)), fill=(198, 204, 209, 255))
        d.ellipse((s(x - 3), s(134), s(x + 3), s(140)), fill=(74, 79, 84, 255))
        for dx, dy in ((0, -7), (7, 0), (0, 7), (-7, 0)):
            d.ellipse((s(x + dx - 1.5), s(137 + dy - 1.5), s(x + dx + 1.5), s(137 + dy + 1.5)), fill=(90, 96, 102, 255))

    d.rounded_rectangle((s(53), s(130), s(276), s(136)), radius=s(3), fill=(24, 28, 32, 220))
    d.rounded_rectangle((s(284), s(115), s(299), s(126)), radius=s(3), fill=(34, 39, 44, 220))
    image = image.resize((320, 180), Image.Resampling.LANCZOS)
    image.save(OUT / filename, format="PNG", optimize=True)


make_car("comfort", (62, 70, 79, 255), (164, 172, 180, 180), (40, 54, 65, 245), "ride-comfort.png")
make_car("xl", (39, 46, 55, 255), (151, 161, 171, 190), (34, 49, 61, 245), "ride-xl.png")


# -----------------------------------------------------------------------------
# Permanent tests / CI contracts.
# -----------------------------------------------------------------------------
hardening_test = '''from pathlib import Path

import pytest

from app.config import Settings


RUNTIME_ROOT = Path(__file__).resolve().parents[1] / "app"


def _base_production_env(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("MONGODB_URI", "mongodb://example.invalid")
    monkeypatch.setenv("MONGODB_DB_NAME", "letsgoride")
    monkeypatch.setenv("PUBLIC_API_BASE_URL", "https://letsgoride-v2-production.onrender.com")
    monkeypatch.setenv("CORS_ORIGINS", "https://letsgoride.site")
    monkeypatch.setenv("CLOUDINARY_CLOUD_NAME", "cloud")
    monkeypatch.setenv("CLOUDINARY_API_KEY", "key")
    monkeypatch.setenv("CLOUDINARY_API_SECRET", "secret")
    monkeypatch.delenv("CLOUDINARY_URL", raising=False)


def test_nonproduction_release_environment_is_rejected(monkeypatch):
    monkeypatch.setenv("APP_ENV", "staging")
    with pytest.raises(RuntimeError, match="Unsupported APP_ENV"):
        Settings()


def test_production_rejects_nonproduction_database(monkeypatch):
    _base_production_env(monkeypatch)
    monkeypatch.setenv("MONGODB_DB_NAME", "letsgoride_staging")
    with pytest.raises(RuntimeError, match="MONGODB_DB_NAME"):
        Settings()


def test_production_requires_durable_profile_storage(monkeypatch):
    _base_production_env(monkeypatch)
    monkeypatch.delenv("CLOUDINARY_CLOUD_NAME", raising=False)
    monkeypatch.delenv("CLOUDINARY_API_KEY", raising=False)
    monkeypatch.delenv("CLOUDINARY_API_SECRET", raising=False)
    with pytest.raises(RuntimeError, match="Cloudinary"):
        Settings()


def test_runtime_has_no_retired_demo_staging_or_mock_switches():
    source = "\\n".join(path.read_text(encoding="utf-8") for path in RUNTIME_ROOT.rglob("*.py"))
    for forbidden in (
        "STAGING_EXTERNAL_TEST_CITY_ID",
        "_staging_external_service_area",
        "LEGACY_DEMO_RIDE_SIGNATURES",
        "cleanup_demo_rides",
        "mock_otp_allowed",
        "MOCK_OTP",
        '"is_demo"',
    ):
        assert forbidden not in source
'''
write("backend/tests/test_final_production_hardening.py", hardening_test)

intercity_test = '''import fs from "fs";
import path from "path";

const read = (relativePath: string) => fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");

describe("Driver intercity product labeling", () => {
  it("keeps scheduled intercity surfaces distinct from Ride Now", () => {
    expect(read("components/layout/BottomNav.tsx")).toContain('label: "Intercity"');
    expect(read("app/(driver)/post-trip.tsx")).toContain('title="Post intercity ride"');
    expect(read("app/(driver)/post-trip.tsx")).toContain("INTERCITY RIDE");
    expect(read("app/(driver)/trips.tsx")).toContain('title="Intercity trips"');
    expect(read("app/(driver)/trips.tsx")).toContain("kept separate from Ride Now");
    expect(read("app/(driver)/availability.tsx")).toContain('title="Intercity calendar"');
    expect(read("app/(driver)/availability.tsx")).toContain("INTERCITY CALENDAR");
  });
});
'''
write("mobile/__tests__/driver-intercity-labels.test.ts", intercity_test)

asset_check = '''#!/usr/bin/env python3
from pathlib import Path
import struct
import zlib

ROOT = Path(__file__).resolve().parents[2]
ASSETS = [
    ROOT / "mobile/assets/images/hailing/ride-economy.png",
    ROOT / "mobile/assets/images/hailing/ride-comfort.png",
    ROOT / "mobile/assets/images/hailing/ride-xl.png",
]
SIGNATURE = b"\\x89PNG\\r\\n\\x1a\\n"


def validate(path: Path) -> None:
    data = path.read_bytes()
    if not data.startswith(SIGNATURE):
        raise SystemExit(f"{path}: invalid PNG signature")
    offset = len(SIGNATURE)
    idat = bytearray()
    width = height = bit_depth = color_type = interlace = None
    saw_iend = False
    while offset < len(data):
        if offset + 12 > len(data):
            raise SystemExit(f"{path}: truncated PNG chunk header")
        length = struct.unpack(">I", data[offset:offset+4])[0]
        chunk_type = data[offset+4:offset+8]
        start = offset + 8
        end = start + length
        if end + 4 > len(data):
            raise SystemExit(f"{path}: truncated {chunk_type!r} chunk")
        payload = data[start:end]
        expected_crc = struct.unpack(">I", data[end:end+4])[0]
        actual_crc = zlib.crc32(chunk_type)
        actual_crc = zlib.crc32(payload, actual_crc) & 0xFFFFFFFF
        if actual_crc != expected_crc:
            raise SystemExit(f"{path}: CRC mismatch in {chunk_type.decode('ascii', 'replace')}")
        if chunk_type == b"IHDR":
            width, height, bit_depth, color_type, _, _, interlace = struct.unpack(">IIBBBBB", payload)
        elif chunk_type == b"IDAT":
            idat.extend(payload)
        elif chunk_type == b"IEND":
            saw_iend = True
            offset = end + 4
            break
        offset = end + 4
    if not saw_iend or offset != len(data):
        raise SystemExit(f"{path}: invalid PNG termination")
    if (width, height) != (320, 180) or bit_depth != 8 or interlace != 0:
        raise SystemExit(f"{path}: expected 320x180, 8-bit, non-interlaced PNG")
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}.get(color_type)
    if channels is None:
        raise SystemExit(f"{path}: unsupported color type {color_type}")
    try:
        raw = zlib.decompress(bytes(idat))
    except zlib.error as exc:
        raise SystemExit(f"{path}: corrupt IDAT stream: {exc}") from exc
    expected = height * (1 + width * channels)
    if len(raw) != expected:
        raise SystemExit(f"{path}: unexpected decompressed size {len(raw)} != {expected}")
    row = 1 + width * channels
    for y in range(height):
        filter_type = raw[y * row]
        if filter_type > 4:
            raise SystemExit(f"{path}: invalid row filter {filter_type} at row {y}")
    print(f"OK {path.relative_to(ROOT)} {width}x{height} color_type={color_type}")


for asset in ASSETS:
    validate(asset)
'''
write(".github/scripts/check-hailing-assets.py", asset_check)

p = ".github/workflows/platform-v2-ci.yml"
text = read(p)
anchor = "      - name: Typecheck\n        run: npm run typecheck\n"
if text.count(anchor) != 1:
    raise SystemExit("platform-v2-ci.yml: Typecheck anchor missing")
write(
    p,
    text.replace(
        anchor,
        "      - name: Verify Ride Now image asset integrity\n"
        "        run: python ../.github/scripts/check-hailing-assets.py\n\n"
        + anchor,
        1,
    ),
)

print("Final launch patch prepared successfully.")
