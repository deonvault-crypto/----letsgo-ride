import base64
import io
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from datetime import datetime, timedelta, timezone

from fastapi import UploadFile
from fastapi import HTTPException
from starlette.requests import Request
from starlette.datastructures import Headers
from PIL import Image

from app.database import database
from app.services.auth_service import (
    create_password_record,
    create_session_record,
    ensure_admin_seed_user,
    find_user_by_token,
    password_matches,
    reset_email_password,
    create_code_record,
    verify_email_code,
    verify_email_user,
)
from app.services.upload_security_service import validate_upload
from app.services.workforce_service import public_application
from app.services.rate_limit_service import RateLimit, RateLimitService
from app.config import Settings
from app.routers.auth import email_login, logout


PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")


class SecurityHardeningTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        database.client = None
        database.status = "not_configured"
        database.memory = {name: [] for name in database.memory}

    async def test_session_requires_unexpired_server_lifetime(self):
        session = create_session_record()
        await database.insert_one("users", {"id": "u1", "status": "active", **session})
        self.assertEqual((await find_user_by_token(session["token"]))["id"], "u1")
        await database.update_one("users", "u1", {"token_expires_at": (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()})
        self.assertIsNone(await find_user_by_token(session["token"]))

    async def test_password_reset_revokes_existing_session(self):
        code = "123456"
        await database.insert_one("users", {
            "id": "u2", "email": "owner@example.com", "normalized_email": "owner@example.com", "status": "active",
            "token": "stolen", "token_expires_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
            "reset_expires_at": (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat(), "reset_attempts": 0,
            **create_code_record(code, "reset"),
        })
        self.assertTrue(await reset_email_password("owner@example.com", code, "SaferPassword!2026"))
        self.assertIsNone(await find_user_by_token("stolen"))

    async def test_verifying_an_already_verified_email_never_returns_its_session(self):
        await database.insert_one("users", {"id": "u3", "email": "verified@example.com", "normalized_email": "verified@example.com", "email_verified": True, "token": "private-session"})
        result = await verify_email_code("verified@example.com", "anything")
        self.assertEqual(result.get("token"), "")

    async def test_logout_revokes_server_session(self):
        session = create_session_record()
        user = await database.insert_one("users", {"id": "logout-user", "status": "active", **session})
        await logout(user)
        self.assertIsNone(await find_user_by_token(session["token"]))

    async def test_spoofed_image_is_rejected_and_valid_image_is_reencoded(self):
        spoof = UploadFile(file=io.BytesIO(b"not an image"), filename="id.jpg", headers=Headers({"content-type": "image/jpeg"}))
        with self.assertRaises(ValueError):
            await validate_upload(spoof, max_bytes=1024, allow_pdf=False, stem="id.jpg")
        image = UploadFile(file=io.BytesIO(PNG), filename="id.png", headers=Headers({"content-type": "image/png"}))
        validated = await validate_upload(image, max_bytes=1024 * 1024, allow_pdf=False, stem="id.png")
        self.assertEqual(validated.content_type, "image/jpeg")
        self.assertTrue(validated.data.startswith(b"\xff\xd8\xff"))

    async def test_profile_photo_sanitization_can_bound_decoded_dimensions(self):
        oversized = io.BytesIO()
        Image.new("RGB", (2000, 1500), color=(20, 130, 70)).save(oversized, format="PNG")
        upload = UploadFile(file=io.BytesIO(oversized.getvalue()), filename="profile.png", headers=Headers({"content-type": "image/png"}))

        validated = await validate_upload(
            upload,
            max_bytes=4 * 1024 * 1024,
            allow_pdf=False,
            stem="profile",
            max_image_edge=1280,
        )

        with Image.open(io.BytesIO(validated.data)) as decoded:
            self.assertEqual(max(decoded.size), 1280)

    def test_worker_application_never_exposes_storage_reference(self):
        public = public_application({"product": "courier", "documents": [{"id": "d", "document_type": "selfie", "cloudinary_public_id": "secret", "delivery_type": "authenticated"}]})
        self.assertNotIn("file_url", public["documents"][0])
        self.assertNotIn("cloudinary_public_id", public["documents"][0])
        self.assertTrue(public["documents"][0]["has_file"])

    async def test_rate_limit_applies_to_ip_and_account_identity(self):
        limiter = RateLimitService()
        request = Request({"type": "http", "method": "POST", "path": "/auth/email-login", "headers": [], "client": ("203.0.113.10", 1234), "scheme": "https", "server": ("test", 443), "query_string": b""})
        await limiter.enforce(request, "test-login", RateLimit(1, 60), identity="person@example.com")
        with self.assertRaises(HTTPException) as raised:
            await limiter.enforce(request, "test-login", RateLimit(1, 60), identity="person@example.com")
        self.assertEqual(raised.exception.status_code, 429)

    def test_production_requires_explicit_cors_origins(self):
        with patch.dict("os.environ", {"APP_ENV": "production", "CORS_ORIGINS": ""}, clear=False):
            with self.assertRaises(RuntimeError):
                Settings()

    async def test_existing_admin_seed_preserves_existing_password_credentials(self):
        settings = SimpleNamespace(
            admin_auto_create=True,
            admin_seed_email="admin@example.com",
            admin_seed_password="SeedPasswordB!2026",
            session_lifetime_days=30,
        )
        original_credentials = create_password_record("OriginalPasswordA!2026")
        await database.insert_one("users", {
            "id": "admin-existing",
            "email": "admin@example.com",
            "normalized_email": "admin@example.com",
            "name": "Existing Admin",
            "role": "admin",
            "status": "active",
            "email_verified": True,
            **original_credentials,
        })

        with patch("app.services.auth_service.get_settings", return_value=settings):
            await ensure_admin_seed_user()
            admin = await database.find_one("users", {"id": "admin-existing"})
            self.assertEqual(admin["password_hash"], original_credentials["password_hash"])
            self.assertEqual(admin["password_salt"], original_credentials["password_salt"])
            self.assertTrue(password_matches(admin, "OriginalPasswordA!2026"))
            self.assertFalse(password_matches(admin, "SeedPasswordB!2026"))
            self.assertIsNotNone(await verify_email_user("admin@example.com", "OriginalPasswordA!2026"))
            self.assertIsNone(await verify_email_user("admin@example.com", "SeedPasswordB!2026"))

    async def test_new_admin_seed_still_creates_configured_admin(self):
        settings = SimpleNamespace(
            admin_auto_create=True,
            admin_seed_email="new-admin@example.com",
            admin_seed_password="SeedPassword!2026",
            session_lifetime_days=30,
        )

        with patch("app.services.auth_service.get_settings", return_value=settings):
            await ensure_admin_seed_user()

        admin = await database.find_one("users", {"normalized_email": "new-admin@example.com"})
        self.assertIsNotNone(admin)
        self.assertEqual(admin["role"], "admin")
        self.assertEqual(admin["status"], "active")
        self.assertTrue(admin["email_verified"])
        self.assertTrue(password_matches(admin, "SeedPassword!2026"))

    async def test_production_without_mongodb_uri_fails_without_memory_fallback(self):
        settings = SimpleNamespace(app_env="production", mongodb_uri="", mongodb_db_name="letsgoride")
        with patch("app.database.get_settings", return_value=settings):
            with self.assertRaises(RuntimeError):
                await database.connect()
            with self.assertRaises(RuntimeError):
                await database.insert_one("users", {"id": "must-not-use-memory"})
        self.assertEqual(database.memory["users"], [])

    async def test_production_mongodb_connection_failure_fails_without_memory_fallback(self):
        settings = SimpleNamespace(
            app_env="production",
            mongodb_uri="mongodb+srv://example.invalid",
            mongodb_db_name="letsgoride",
        )

        class FailingMongoClient:
            def __init__(self, *_args, **_kwargs):
                self.admin = SimpleNamespace(command=AsyncMock(side_effect=ConnectionError("unreachable")))

            def __getitem__(self, _name):
                return SimpleNamespace()

        with patch("app.database.get_settings", return_value=settings), patch(
            "app.database.AsyncIOMotorClient", FailingMongoClient
        ):
            with self.assertRaises(RuntimeError):
                await database.connect()
            with self.assertRaises(RuntimeError):
                await database.find_one("users", {"id": "must-not-use-memory"})
        self.assertEqual(database.status, "unavailable")

    async def test_development_without_mongodb_keeps_in_memory_storage_available(self):
        settings = SimpleNamespace(app_env="development", mongodb_uri="", mongodb_db_name="letsgoride")
        with patch("app.database.get_settings", return_value=settings):
            await database.connect()
            await database.insert_one("users", {"id": "local-user", "email": "local@example.com"})
            self.assertEqual((await database.find_one("users", {"id": "local-user"}))["email"], "local@example.com")

    async def test_login_failures_are_publicly_generic_but_internally_diagnosed(self):
        request = Request({"type": "http", "method": "POST", "path": "/auth/email-login", "headers": [], "client": ("203.0.113.20", 1234), "scheme": "https", "server": ("test", 443), "query_string": b""})
        credentials = create_password_record("CorrectPassword!2026")
        await database.insert_one("users", {
            "id": "login-user",
            "email": "known@example.com",
            "normalized_email": "known@example.com",
            "status": "active",
            "email_verified": True,
            **credentials,
        })
        await database.insert_one("users", {
            "id": "unverified-user",
            "email": "unverified@example.com",
            "normalized_email": "unverified@example.com",
            "status": "active",
            "email_verified": False,
            **create_password_record("CorrectPassword!2026"),
        })

        async def assert_generic_failure(email: str, password: str, expected_log: str) -> None:
            with self.assertLogs("app.services.auth_service", level="INFO") as logs, patch(
                "app.routers.auth.rate_limit_service.enforce", new=AsyncMock()
            ):
                with self.assertRaises(HTTPException) as raised:
                    await email_login(SimpleNamespace(email=email, password=password), request)
            self.assertEqual(raised.exception.status_code, 401)
            self.assertEqual(raised.exception.detail["error"], "Invalid email or password.")
            joined_logs = "\n".join(logs.output)
            self.assertIn(expected_log, joined_logs)
            self.assertNotIn(password, joined_logs)

        await assert_generic_failure("missing@example.com", "AnyPassword!2026", "outcome=user_not_found")
        await assert_generic_failure("known@example.com", "WrongPassword!2026", "outcome=password_mismatch")
        await assert_generic_failure("unverified@example.com", "CorrectPassword!2026", "outcome=email_unverified")

        with self.assertLogs("app.services.auth_service", level="INFO") as logs:
            self.assertIsNotNone(await verify_email_user("known@example.com", "CorrectPassword!2026"))
        self.assertIn("outcome=login_success", "\n".join(logs.output))
