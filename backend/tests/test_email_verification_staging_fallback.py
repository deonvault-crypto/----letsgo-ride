import os
import unittest
from unittest.mock import AsyncMock, patch

from app.config import get_settings
from app.database import COLLECTION_NAMES, database
from app.services.auth_service import (
    create_email_user,
    reset_email_password,
    start_password_reset,
    verify_email_code,
)


class EmailVerificationStagingFallbackTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database.db = None
        for collection in COLLECTION_NAMES:
            await database.replace_collection(collection, [])
        get_settings.cache_clear()

    async def asyncTearDown(self):
        get_settings.cache_clear()

    async def test_explicit_staging_mock_allows_signup_when_email_provider_is_unavailable(self):
        with patch.dict(
            os.environ,
            {
                "APP_ENV": "staging",
                "ALLOW_STAGING_EMAIL_MOCK": "true",
                "ALLOW_STAGING_MOCK_OTP": "true",
                "MOCK_OTP": "123456",
                "CORS_ORIGINS": "https://letsgoride.site",
            },
            clear=False,
        ):
            get_settings.cache_clear()
            with patch(
                "app.services.auth_service.send_verification_email",
                new=AsyncMock(return_value=False),
            ):
                user = await create_email_user(
                    "Staging QA",
                    "staging.qa@example.com",
                    "StrongPass1$",
                    "Harare",
                    "passenger",
                )

            self.assertFalse(user["email_verified"])
            verified = await verify_email_code("staging.qa@example.com", "123456")
            self.assertIsNotNone(verified)
            self.assertTrue(verified["email_verified"])

    async def test_production_never_uses_staging_mock_fallback(self):
        with patch.dict(
            os.environ,
            {
                "APP_ENV": "production",
                "ALLOW_STAGING_EMAIL_MOCK": "true",
                "MOCK_OTP": "123456",
                "CORS_ORIGINS": "https://letsgoride.site",
            },
            clear=False,
        ):
            get_settings.cache_clear()
            with patch(
                "app.services.auth_service.send_verification_email",
                new=AsyncMock(return_value=False),
            ):
                with self.assertRaisesRegex(RuntimeError, "Email verification could not be sent"):
                    await create_email_user(
                        "Production QA",
                        "production.qa@example.com",
                        "StrongPass1$",
                        "Harare",
                        "passenger",
                    )

    async def test_staging_mock_code_requires_explicit_opt_in(self):
        with patch.dict(
            os.environ,
            {
                "APP_ENV": "staging",
                "ALLOW_STAGING_EMAIL_MOCK": "true",
                "ALLOW_STAGING_MOCK_OTP": "false",
                "MOCK_OTP": "123456",
            },
            clear=False,
        ):
            get_settings.cache_clear()
            with patch(
                "app.services.auth_service.send_verification_email",
                new=AsyncMock(return_value=False),
            ):
                user = await create_email_user(
                    "Secure Staging QA",
                    "secure.staging@example.com",
                    "StrongPass1$",
                    "Harare",
                    "passenger",
                )

            self.assertFalse(user["email_verified"])
            verified = await verify_email_code("secure.staging@example.com", "123456")
            self.assertIsNone(verified)

    async def test_expired_reset_code_is_rejected(self):
        with patch.dict(
            os.environ,
            {
                "APP_ENV": "staging",
                "ALLOW_STAGING_MOCK_OTP": "false",
            },
            clear=False,
        ):
            get_settings.cache_clear()
            with patch(
                "app.services.auth_service.send_verification_email",
                new=AsyncMock(return_value=True),
            ):
                user = await create_email_user(
                    "Reset Expiry QA",
                    "reset.expiry@example.com",
                    "StrongPass1$",
                    "Harare",
                    "passenger",
                )
            with patch(
                "app.services.auth_service.generate_email_code",
                return_value="654321",
            ), patch(
                "app.services.auth_service.send_password_reset_email",
                new=AsyncMock(return_value=True),
            ):
                await start_password_reset(user["email"])

            await database.update_one(
                "users",
                user["id"],
                {"reset_expires_at": "2020-01-01T00:00:00+00:00"},
            )
            reset = await reset_email_password(
                user["email"],
                "654321",
                "NewStrongPass2$",
            )
            self.assertFalse(reset)


if __name__ == "__main__":
    unittest.main()
