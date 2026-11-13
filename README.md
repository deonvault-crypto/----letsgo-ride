# LetsGoRide

Production repository for the LetsGoRide mobile app, API and operations dashboard.

The public website is intentionally isolated on the `website-production` branch under `frontend/` and is deployed independently from that branch.

## Production surfaces

- Mobile: `mobile/` — Expo/React Native
- API: `backend/` — FastAPI
- Operations dashboard: `ops-web/`
- Public website source: `website-production` branch → `frontend/`
- Public site: https://letsgoride.site
- Production API: https://letsgoride-v2-production.onrender.com

## Release model

There is one EAS build profile: `production`. Android builds an AAB for the Google Play `production` track. iOS builds for App Store Connect.

Permanent GitHub automation is intentionally limited to:

- `LetsGoRide Production CI` — typecheck, automated tests, Android policy checks, backend tests and production smoke checks.
- `LetsGoRide Mobile Production Release` — manual production-only native release.
- `LetsGoRide Reviewed App Update` — manual production OTA release, gated on green CI for the exact source commit plus update-compatibility and production-environment checks.

Automated tests remain in the repository because they protect production releases; they are not runtime modes and cannot be selected by app users.

## Production safety

- Production API documentation is disabled.
- Production requires explicit trusted CORS origins.
- Production email delivery fails closed if Resend is unavailable.
- Production Stripe mode requires live credentials when enabled.
- No staging, preview, demo-seed or TestFlight build profile is part of the active release configuration.
- Website changes belong on `website-production`, not on `platform-v2-m1-m6`.
