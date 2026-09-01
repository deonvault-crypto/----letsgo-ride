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

# Preserve the hardening suite, but make its release assertion production-only.
hardening = Path("mobile/__tests__/production-hardening-final.test.ts")
text = hardening.read_text()
old = '''  it("pins TestFlight and production builds to the production API", () => {
    const eas = JSON.parse(readMobile("eas.json"));
    expect(eas.build.testflight.env.EXPO_PUBLIC_API_BASE_URL).toBe("https://letsgoride-v2-production.onrender.com");
    expect(eas.build.production.env.EXPO_PUBLIC_API_BASE_URL).toBe("https://letsgoride-v2-production.onrender.com");
    expect(eas.build.preview.env.EXPO_PUBLIC_API_BASE_URL).toBe("https://letsgoride-v2-staging.onrender.com");
  });'''
new = '''  it("exposes one production EAS build and submit contract", () => {
    const eas = JSON.parse(readMobile("eas.json"));
    expect(Object.keys(eas.build)).toEqual(["production"]);
    expect(eas.build.production.env.EXPO_PUBLIC_API_BASE_URL).toBe("https://letsgoride-v2-production.onrender.com");
    expect(eas.build.production.autoIncrement).toBe(true);
    expect(eas.build.production.android.buildType).toBe("app-bundle");
    expect(eas.submit.production.android.track).toBe("production");
    expect(eas.submit.production.android.releaseStatus).toBe("completed");
    expect(eas.submit.production.ios.ascAppId).toBe("6772862281");
  });'''
if old not in text:
    raise SystemExit("production hardening EAS marker not found")
hardening.write_text(text.replace(old, new, 1))

# Remove the old TestFlight/staging-named test and replace it with a clear production-only contract.
Path("mobile/__tests__/testflight-staging-profile.test.ts").unlink(missing_ok=True)
Path("mobile/__tests__/production-only-release-profile.test.ts").write_text('''const eas = require("../eas.json");

describe("production-only native release profile", () => {
  it("has no development, preview, staging, or TestFlight build path", () => {
    expect(Object.keys(eas.build)).toEqual(["production"]);
    expect(eas.build.development).toBeUndefined();
    expect(eas.build.preview).toBeUndefined();
    expect(eas.build.testflight).toBeUndefined();
  });

  it("targets only the live production API and public store release paths", () => {
    expect(eas.build.production.env.EXPO_PUBLIC_API_BASE_URL).toBe(
      "https://letsgoride-v2-production.onrender.com",
    );
    expect(eas.build.production.android.buildType).toBe("app-bundle");
    expect(eas.submit.production.android.track).toBe("production");
    expect(eas.submit.production.android.releaseStatus).toBe("completed");
    expect(eas.submit.production.ios.ascAppId).toBe("6772862281");
  });
});
''')

print("production-only safety tests updated")
