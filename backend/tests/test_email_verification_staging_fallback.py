import os
import unittest
from unittest.mock import AsyncMock, patch

from app.config import get_settings
from app.database import COLLECTION_NAMES, database
from app.services.auth_service import create_email_user, verify_email_code


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


if __name__ == "__main__":
    unittest.main()
