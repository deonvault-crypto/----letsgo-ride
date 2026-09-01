from pathlib import Path
import json
import shutil

ROOT = Path('.')


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        if new in text:
            return
        raise SystemExit(f'Marker not found in {path}: {old[:180]!r}')
    p.write_text(text.replace(old, new, 1))


# 1) One EAS path only: production.
Path('mobile/eas.json').write_text(json.dumps({
    'cli': {
        'version': '>= 18.13.0',
        'appVersionSource': 'remote',
    },
    'build': {
        'production': {
            'autoIncrement': True,
            'env': {
                'EXPO_PUBLIC_API_BASE_URL': 'https://letsgoride-v2-production.onrender.com',
                'EXPO_PUBLIC_ENABLE_AUTHENTICATED_WEB': 'false',
            },
            'ios': {'simulator': False},
            'android': {'buildType': 'app-bundle'},
        }
    },
    'submit': {
        'production': {
            'android': {
                'track': 'production',
                'releaseStatus': 'completed',
            },
            'ios': {'ascAppId': '6772862281'},
        }
    },
}, indent=2) + '\n')

# 2) Remove active staging/demo runtime hooks from backend.
config = Path('backend/app/config.py')
text = config.read_text()
for block in [
'''        self.allow_staging_mock_otp = self._parse_bool(\n            os.getenv("ALLOW_STAGING_MOCK_OTP", "false")\n        )\n''',
'''        self.allow_staging_email_mock = self._parse_bool(\n            os.getenv("ALLOW_STAGING_EMAIL_MOCK", "false")\n        )\n''',
'''        self.enable_demo_seed = self._parse_bool(os.getenv("ENABLE_DEMO_SEED", "false"))\n''',
'''        self.routing_staging_smoke_test_enabled = self._parse_bool(\n            os.getenv("ROUTING_STAGING_SMOKE_TEST_ENABLED", "false")\n        )\n''',
'''        self.courier_dispatch_staging_smoke_test_enabled = self._parse_bool(\n            os.getenv("COURIER_DISPATCH_STAGING_SMOKE_TEST_ENABLED", "false")\n        )\n''',
'''    @property\n    def staging_email_mock_allowed(self) -> bool:\n        return self.app_env != "production" and self.allow_staging_email_mock\n\n''',
]:
    text = text.replace(block, '')
text = text.replace(
    'else self.app_env.strip().lower() in {"development", "test", "staging"}',
    'else self.app_env.strip().lower() in {"development", "test"}',
)
text = text.replace(
'''        # Stripe card payments are fail-closed and environment isolated. A staging\n        # process may never boot with live credentials and production may never boot\n        # with test credentials. Publishable keys are safe to return to authenticated\n        # mobile clients; secret and webhook keys never leave the backend.\n''',
'''        # Stripe card payments are fail-closed. Production requires live-mode keys.\n        # Publishable keys are safe to return to authenticated mobile clients; secret\n        # and webhook keys never leave the backend.\n''')
text = text.replace(
'''        elif app_env == "staging":\n            if not self.stripe_secret_key.startswith("sk_test_") or not self.stripe_publishable_key.startswith("pk_test_"):\n                raise RuntimeError("Staging Stripe payments require test-mode keys.")\n''',
'''        elif app_env in {"development", "test"}:\n            if not self.stripe_secret_key.startswith("sk_test_") or not self.stripe_publishable_key.startswith("pk_test_"):\n                raise RuntimeError("Non-production Stripe checks require test-mode keys.")\n''')
text = text.replace(
'''    @property\n    def mock_otp_allowed(self) -> bool:\n        app_env = self.app_env.strip().lower()\n        return bool(self.mock_otp) and (\n            app_env in {"development", "test"} or (\n                app_env == "staging" and self.allow_staging_mock_otp\n            )\n        )\n''',
'''    @property\n    def mock_otp_allowed(self) -> bool:\n        return bool(self.mock_otp) and self.app_env.strip().lower() in {"development", "test"}\n''')
config.write_text(text)

main = Path('backend/app/main.py')
text = main.read_text()
text = text.replace('from app.services.ride_service import seed_demo_rides\n', '')
text = text.replace('from app.services.staging_courier_dispatch_smoke_service import run_staging_courier_dispatch_smoke_test\n', '')
text = text.replace('from app.services.staging_routing_smoke_service import run_staging_routing_smoke_test\n', '')
text = text.replace('staging_routing_smoke_task: asyncio.Task | None = None\n', '')
text = text.replace('staging_courier_dispatch_smoke_task: asyncio.Task | None = None\n', '')
text = text.replace(', staging_routing_smoke_task, staging_courier_dispatch_smoke_task', '')
text = text.replace('    if settings.enable_demo_seed:\n        await seed_demo_rides()\n', '')
start = text.find('    logger.info(\n        "routing_smoke_gate')
end = text.find('\n\n\n@app.on_event("shutdown")', start)
if start != -1 and end != -1:
    text = text[:start] + text[end:]
text = text.replace('    if staging_routing_smoke_task:\n        staging_routing_smoke_task.cancel()\n', '')
text = text.replace('    if staging_courier_dispatch_smoke_task:\n        staging_courier_dispatch_smoke_task.cancel()\n', '')
main.write_text(text)

ride_service = Path('backend/app/services/ride_service.py')
text = ride_service.read_text()
text = text.replace('''\n\nasync def seed_demo_rides() -> None:\n    logger.info("demo_ride_seed_skipped")\n''', '')
ride_service.write_text(text)

# Email delivery is fail-closed outside explicit unit-test mocks; no staging fallback.
auth_service = Path('backend/app/services/auth_service.py')
text = auth_service.read_text()
text = text.replace(
'''    if not sent:\n        settings = get_settings()\n        if settings.staging_email_mock_allowed:\n            logger.warning(\n                "Email delivery unavailable in non-production; explicit staging mock verification fallback is active."\n            )\n            return updated\n        raise RuntimeError("Email verification could not be sent.")\n''',
'''    if not sent:\n        raise RuntimeError("Email verification could not be sent.")\n''')
auth_service.write_text(text)

# Delete staging-only runtime smoke services and their dedicated tests if present.
for p in [
    'backend/app/services/staging_routing_smoke_service.py',
    'backend/app/services/staging_courier_dispatch_smoke_service.py',
]:
    Path(p).unlink(missing_ok=True)
for p in Path('backend/tests').glob('*staging*'):
    if p.is_file():
        p.unlink()

# 3) Keep one permanent CI + one clear production release workflow. Remove historical one-shots.
for p in [
    '.github/workflows/admin-control-center-finalize-once.yml',
    '.github/workflows/admin-control-center-recovery-once.yml',
    '.github/workflows/build34-recovery-patch.yml',
    '.github/workflows/eas-preview-build.yml',
    '.github/workflows/eas-testflight-release.yml',
    '.github/workflows/product-polish-validation.yml',
    '.github/workflows/weekly-driver-settlement-apply-once.yml',
]:
    Path(p).unlink(missing_ok=True)
shutil.rmtree('test_reports', ignore_errors=True)

# Clean permanent CI wording/env without weakening tests.
ci = Path('.github/workflows/platform-v2-ci.yml')
text = ci.read_text()
text = text.replace('name: Platform V2 CI', 'name: LetsGoRide Production CI')
text = text.replace('    # See the mobile job: validate the staging branch once, on the exact SHA.\n', '    # Validate the production branch once on the exact SHA.\n')
text = text.replace('        env:\n          ENABLE_DEMO_SEED: "false"\n        run: python -c "from app.main import app; assert app.title == \'LetsGoRide API\'"', '        run: python -c "from app.main import app; assert app.title == \'LetsGoRide API\'"')
text = text.replace('        env:\n          ENABLE_DEMO_SEED: "false"\n        run: python -m pytest tests -q', '        run: python -m pytest tests -q')
ci.write_text(text)

# 4) Replace stale README with a production-only operator view.
Path('README.md').write_text('''# LetsGoRide\n\nProduction repository for the LetsGoRide mobile app, API and public website.\n\n## Production surfaces\n\n- Mobile: `mobile/` — Expo/React Native\n- API: `backend/` — FastAPI\n- Website: `frontend/`\n- Public site: https://letsgoride.site\n- Production API: https://letsgoride-v2-production.onrender.com\n\n## Release model\n\nThere is one EAS build profile: `production`. Android builds an AAB for the Google Play `production` track. iOS builds for App Store Connect.\n\nPermanent GitHub automation is intentionally limited to:\n\n- `LetsGoRide Production CI` — typecheck, automated tests, Android policy checks, backend tests and production smoke checks.\n- `LetsGoRide Mobile Production Release` — manual production-only native release.\n\nAutomated tests remain in the repository because they protect production releases; they are not runtime modes and cannot be selected by app users.\n\n## Production safety\n\n- Production API documentation is disabled.\n- Production requires explicit trusted CORS origins.\n- Production email delivery fails closed if Resend is unavailable.\n- Production Stripe mode requires live credentials when enabled.\n- No staging, preview, demo-seed or TestFlight build profile is part of the active release configuration.\n''')

# 5) Permanent manual production-only mobile release workflow.
Path('.github/workflows/mobile-production-release.yml').write_text('''name: LetsGoRide Mobile Production Release\n\non:\n  workflow_dispatch:\n\npermissions:\n  contents: read\n\njobs:\n  validate:\n    name: Validate production release\n    if: github.ref == 'refs/heads/platform-v2-m1-m6'\n    runs-on: ubuntu-latest\n    timeout-minutes: 20\n    defaults:\n      run:\n        working-directory: mobile\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 20\n          cache: npm\n          cache-dependency-path: mobile/package-lock.json\n      - run: npm ci --no-audit --no-fund\n      - name: Verify production-only EAS contract\n        run: |\n          node <<'NODE'\n          const eas = require('./eas.json');\n          const builds = Object.keys(eas.build || {});\n          if (JSON.stringify(builds) !== JSON.stringify(['production'])) throw new Error(`Unexpected build profiles: ${builds.join(', ')}`);\n          if (eas.build.production.env.EXPO_PUBLIC_API_BASE_URL !== 'https://letsgoride-v2-production.onrender.com') throw new Error('Production API URL mismatch');\n          if (eas.submit.production.android.track !== 'production') throw new Error('Android is not targeting production');\n          if (eas.submit.production.android.releaseStatus !== 'completed') throw new Error('Android release status is not completed');\n          NODE\n      - run: npm audit --audit-level=critical\n      - run: npm run typecheck\n      - run: npm test -- --runInBand\n      - run: npm run verify:android\n      - name: Verify Expo authentication\n        env:\n          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}\n        run: npx eas-cli@latest whoami --non-interactive\n\n  android:\n    name: Android production\n    needs: validate\n    runs-on: ubuntu-latest\n    timeout-minutes: 45\n    defaults:\n      run:\n        working-directory: mobile\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 20\n          cache: npm\n          cache-dependency-path: mobile/package-lock.json\n      - run: npm ci --no-audit --no-fund\n      - name: Build and submit Google Play production\n        env:\n          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}\n        run: npx eas-cli@latest build --platform android --profile production --auto-submit-with-profile production --non-interactive\n\n  ios:\n    name: iOS App Store Connect production\n    needs: validate\n    runs-on: ubuntu-latest\n    timeout-minutes: 45\n    defaults:\n      run:\n        working-directory: mobile\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 20\n          cache: npm\n          cache-dependency-path: mobile/package-lock.json\n      - run: npm ci --no-audit --no-fund\n      - name: Build and upload App Store production\n        env:\n          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}\n        run: npx eas-cli@latest build --platform ios --profile production --auto-submit-with-profile production --non-interactive\n''')

print('production-only cleanup applied')
