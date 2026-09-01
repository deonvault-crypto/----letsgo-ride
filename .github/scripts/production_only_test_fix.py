from pathlib import Path
import re


def replace_method(path: str, method_name: str, replacement: str) -> None:
    p = Path(path)
    text = p.read_text()
    pattern = rf"\n    def {re.escape(method_name)}\(self\):.*?(?=\n    def |\Z)"
    updated, count = re.subn(pattern, "\n" + replacement.rstrip() + "\n", text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"Could not replace {method_name} in {path}")
    p.write_text(updated)


replace_method(
    "backend/tests/test_secret_configuration_hardening.py",
    "test_staging_mock_otp_requires_explicit_value_and_opt_in",
    '''    def test_production_mock_otp_is_never_allowed(self):
        with patch.dict(
            os.environ,
            {
                "APP_ENV": "production",
                "PUBLIC_API_BASE_URL": "https://example.invalid",
                "CORS_ORIGINS": "https://letsgoride.site",
                "MOCK_OTP": "internal-test-code",
            },
            clear=True,
        ):
            self.assertFalse(Settings().mock_otp_allowed)

        with patch.dict(
            os.environ,
            {
                "APP_ENV": "test",
                "MOCK_OTP": "internal-test-code",
            },
            clear=True,
        ):
            self.assertTrue(Settings().mock_otp_allowed)
''',
)

replace_method(
    "backend/tests/test_stripe_hailing_payments.py",
    "test_staging_and_production_stripe_modes_fail_closed_when_keys_are_mixed",
    '''    def test_production_and_internal_test_stripe_modes_fail_closed_when_keys_are_mixed(self):
        base = {
            "MONGODB_URI": "",
            "CORS_ORIGINS": "https://letsgoride.site",
            "PUBLIC_API_BASE_URL": "https://example.invalid",
            "STRIPE_ENABLED": "true",
            "STRIPE_WEBHOOK_SECRET": "whsec_example",
        }
        with patch.dict(
            os.environ,
            {
                **base,
                "APP_ENV": "production",
                "STRIPE_SECRET_KEY": "sk_test_wrong",
                "STRIPE_PUBLISHABLE_KEY": "pk_test_wrong",
            },
            clear=True,
        ):
            with self.assertRaisesRegex(RuntimeError, "Production Stripe payments require live-mode keys"):
                Settings()

        with patch.dict(
            os.environ,
            {
                **base,
                "APP_ENV": "test",
                "STRIPE_SECRET_KEY": "sk_live_wrong",
                "STRIPE_PUBLISHABLE_KEY": "pk_live_wrong",
            },
            clear=True,
        ):
            with self.assertRaisesRegex(RuntimeError, "Non-production Stripe checks require test-mode keys"):
                Settings()
''',
)

print("production-only safety tests updated")
