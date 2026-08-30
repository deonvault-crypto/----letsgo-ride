import os
import unittest
from unittest.mock import patch

from app.config import Settings, get_settings
from scripts.provision_staging_qa_accounts import (
    _load_credentials,
    _require_staging_environment,
)


class SecretConfigurationHardeningTests(unittest.TestCase):
    def tearDown(self) -> None:
        get_settings.cache_clear()

    def test_mock_otp_has_no_source_default(self):
        with patch.dict(os.environ, {"APP_ENV": "development"}, clear=True):
            settings = Settings()
            self.assertEqual(settings.mock_otp, "")
            self.assertFalse(settings.mock_otp_allowed)

    def test_staging_mock_otp_requires_explicit_value_and_opt_in(self):
        with patch.dict(
            os.environ,
            {
                "APP_ENV": "staging",
                "ALLOW_STAGING_MOCK_OTP": "true",
            },
            clear=True,
        ):
            self.assertFalse(Settings().mock_otp_allowed)

        with patch.dict(
            os.environ,
            {
                "APP_ENV": "staging",
                "ALLOW_STAGING_MOCK_OTP": "true",
                "MOCK_OTP": "environment-only-test-code",
            },
            clear=True,
        ):
            self.assertTrue(Settings().mock_otp_allowed)

    def test_production_refuses_admin_auto_create(self):
        with patch.dict(
            os.environ,
            {
                "APP_ENV": "production",
                "CORS_ORIGINS": "https://letsgoride.site",
                "ADMIN_AUTO_CREATE": "true",
                "PUBLIC_API_BASE_URL": "https://letsgoride-v2-production.onrender.com",
                "HAILING_ENABLED": "true",
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
                "HAILING_ENABLED": "true",
            },
            clear=True,
        ):
            with self.assertRaisesRegex(
                RuntimeError, "PUBLIC_API_BASE_URL must be explicitly configured"
            ):
                Settings()

    def test_production_requires_explicit_hailing_enabled_decision(self):
        with patch.dict(
            os.environ,
            {
                "APP_ENV": "production",
                "CORS_ORIGINS": "https://letsgoride.site",
                "PUBLIC_API_BASE_URL": "https://letsgoride-v2-production.onrender.com",
            },
            clear=True,
        ):
            with self.assertRaisesRegex(RuntimeError, "HAILING_ENABLED"):
                Settings()

    def test_stripe_keys_are_environment_mode_locked(self):
        with patch.dict(
            os.environ,
            {
                "APP_ENV": "production",
                "CORS_ORIGINS": "https://letsgoride.site",
                "PUBLIC_API_BASE_URL": "https://letsgoride-v2-production.onrender.com",
                "HAILING_ENABLED": "true",
                "STRIPE_ENABLED": "true",
                "STRIPE_ACCOUNT_ID": "acct_test",
                "STRIPE_CURRENCY": "usd",
                "STRIPE_SECRET_KEY": "sk_test_not_for_prod",
                "STRIPE_PUBLISHABLE_KEY": "pk_test_not_for_prod",
                "STRIPE_WEBHOOK_SECRET": "whsec_fake",
            },
            clear=True,
        ):
            with self.assertRaisesRegex(RuntimeError, "live secret key"):
                Settings()

        with patch.dict(
            os.environ,
            {
                "APP_ENV": "staging",
                "CORS_ORIGINS": "https://letsgoride.site",
                "PUBLIC_API_BASE_URL": "https://letsgoride-v2-staging.onrender.com",
                "HAILING_ENABLED": "true",
                "STRIPE_ENABLED": "true",
                "STRIPE_ACCOUNT_ID": "acct_test",
                "STRIPE_CURRENCY": "usd",
                "STRIPE_SECRET_KEY": "sk_live_not_for_staging",
                "STRIPE_PUBLISHABLE_KEY": "pk_live_not_for_staging",
                "STRIPE_WEBHOOK_SECRET": "whsec_fake",
            },
            clear=True,
        ):
            with self.assertRaisesRegex(RuntimeError, "test secret key"):
                Settings()

    def test_qa_provisioner_refuses_non_staging_environment(self):
        with self.assertRaisesRegex(RuntimeError, "forbidden outside"):
            _require_staging_environment("production", "letsgoride_staging")

    def test_qa_provisioner_refuses_non_staging_database(self):
        with self.assertRaisesRegex(RuntimeError, "refuses any database"):
            _require_staging_environment("staging", "letsgoride")

    def test_qa_provisioner_has_no_hardcoded_credentials(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(RuntimeError, "QA_ADMIN_EMAIL"):
                _load_credentials()


if __name__ == "__main__":
    unittest.main()
