import base64
import io
import unittest
from unittest.mock import patch
from datetime import datetime, timedelta, timezone

from fastapi import UploadFile
from fastapi import HTTPException
from starlette.requests import Request
from starlette.datastructures import Headers
from PIL import Image

from app.database import database
from app.services.auth_service import create_session_record, find_user_by_token, reset_email_password, create_code_record, verify_email_code
from app.services.upload_security_service import validate_upload
from app.services.workforce_service import public_application
from app.services.rate_limit_service import RateLimit, RateLimitService
from app.config import Settings
from app.routers.auth import logout


PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")


class SecurityHardeningTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
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
