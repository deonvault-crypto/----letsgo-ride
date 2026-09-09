import os
import unittest
from unittest.mock import patch

from app.config import Settings, get_settings


class SecretConfigurationHardeningTests(unittest.TestCase):
    def tearDown(self) -> None:
        get_settings.cache_clear()

    def test_mock_otp_is_not_runtime_configuration(self):
        with patch.dict(
            os.environ,
            {
                "APP_ENV": "development",
                "MOCK_OTP": "internal-test-code",
            },
            clear=True,
        ):
            settings = Settings()
            self.assertFalse(hasattr(settings, "mock_otp"))
            self.assertFalse(hasattr(settings, "mock_otp_allowed"))

    def test_production_exposes_no_mock_otp_capability(self):
        with patch.dict(
            os.environ,
            {
                "APP_ENV": "production",
                "PUBLIC_API_BASE_URL": "https://example.invalid",
                "CORS_ORIGINS": "https://letsgoride.site",
                "CLOUDINARY_CLOUD_NAME": "unit-test-cloud",
                "CLOUDINARY_API_KEY": "unit-test-key",
                "CLOUDINARY_API_SECRET": "unit-test-secret",
                "MOCK_OTP": "internal-test-code",
            },
            clear=True,
        ):
            settings = Settings()
            self.assertFalse(hasattr(settings, "mock_otp"))
            self.assertFalse(hasattr(settings, "mock_otp_allowed"))

    def test_production_refuses_admin_auto_create(self):
        with patch.dict(
            os.environ,
            {
                "APP_ENV": "production",
                "CORS_ORIGINS": "https://letsgoride.site",
                "ADMIN_AUTO_CREATE": "true",
            },
            clear=True,
        ):
            with self.assertRaisesRegex(
                RuntimeError, "ADMIN_AUTO_CREATE is forbidden in production"
            ):
                Settings()

    def test_production_requires_explicit_public_api_identity(self):
        with patch.dict(
            os.environ,
            {
                "APP_ENV": "production",
                "CORS_ORIGINS": "https://letsgoride.site",
                "ADMIN_AUTO_CREATE": "false",
            },
            clear=True,
        ):
            with self.assertRaisesRegex(
                RuntimeError, "PUBLIC_API_BASE_URL must be explicitly configured"
            ):
                Settings()


if __name__ == "__main__":
    unittest.main()
