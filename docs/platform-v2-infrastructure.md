# LetsGoRide Platform V2 Infrastructure

This document is the operational map for Platform V2. GitHub is the source of truth for code. Production and staging must remain intentionally separated.

## Environments

### Production

- GitHub branch: `main`
- Render backend: `letsgoride-backend`
- Render backend URL: `https://letsgoride-backend.onrender.com`
- Render region: Virginia
- Render plan: Starter
- Render auto-deploy: enabled from `main`
- Website/static frontend: Render service `letsgo-ride-frontend`
- Mobile default API URL: production backend
- MongoDB database: configured by `MONGODB_URI` / `MONGODB_DB_NAME`
- Transactional email: Resend
- Resend sending domain: `letsgoride.site`

Production must never be used as the database for Platform V2 test orders, courier jobs, merchant onboarding, or destructive QA.

### Staging target

- GitHub source branch: `platform-v2-m1-m6` until Platform V2 merges
- Dedicated Render backend service
- Dedicated staging MongoDB database
- `APP_ENV=staging`
- `ENABLE_DEMO_SEED=false`
- Separate secrets from production where practical
- Mobile builds point at staging through `EXPO_PUBLIC_API_BASE_URL`

Do not create staging by pointing the Platform V2 branch at the production MongoDB database.

## Runtime topology

```text
GitHub
  |
  +-- mobile/ (Expo React Native)
  |     |
  |     +-- Ride
  |     +-- Food
  |     +-- Courier
  |     +-- Driver/Courier operations
  |     +-- react-native-maps / Expo Location
  |
  +-- backend/ (FastAPI)
        |
        +-- MongoDB
        +-- Resend
        +-- Courier / Food orchestration
        +-- Merchant operations
        +-- Ride / auth / messaging / verification
```

## Required backend environment variables

These names are derived from `backend/app/config.py`. Values are secrets/configuration and must not be committed.

### Core

- `APP_ENV`
- `MONGODB_URI`
- `MONGODB_DB_NAME`
- `PUBLIC_API_BASE_URL`
- `CORS_ORIGINS`
- `ENABLE_DEMO_SEED`
- `ALLOW_STAGING_MOCK_OTP` (staging-only, defaults off; never enable in production)

### Admin/bootstrap

- `ADMIN_SEED_EMAIL`
- `ADMIN_SEED_PASSWORD`
- `ADMIN_AUTO_CREATE`

### Email

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `RESEND_REPLY_TO_EMAIL`

### Media / verification

- `CLOUDINARY_URL` or the split Cloudinary variables
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `ENABLE_FACE_AI`
- `VERIFICATION_OCR_ENABLED`
- `VERIFICATION_OCR_PROVIDER`
- `VERIFICATION_FACE_MATCH_ENABLED`
- `VERIFICATION_FACE_MATCH_PROVIDER`
- `VERIFICATION_AUTO_APPROVAL_ENABLED`
- `VERIFICATION_DUPLICATE_DETECTION_ENABLED`
- `VERIFICATION_RISK_SCORING_ENABLED`

### Routing and courier pricing

- `ROUTING_PROVIDER`
- `GOOGLE_MAPS_API_KEY`
- `ROUTING_REGION_CODE`
- `COURIER_AUTO_PRICING_ENABLED`
- `COURIER_BASE_PRICE_USD`
- `COURIER_PRICE_PER_KM_USD`
- `COURIER_PRICE_PER_MINUTE_USD`
- `COURIER_MINIMUM_PRICE_USD`
- `COURIER_PAYOUT_PERCENT`

## Mobile environment

The mobile app now supports:

- `EXPO_PUBLIC_API_BASE_URL`

If the variable is absent, the app intentionally falls back to the production Render backend for compatibility with existing release builds.

Staging/TestFlight/internal builds must explicitly set `EXPO_PUBLIC_API_BASE_URL` to the staging backend.

## Current infrastructure audit — 2026-08-23

### GitHub

- Platform V2 remains isolated on `platform-v2-m1-m6`; `main` remains production.
- Platform V2 CI covers mobile typecheck/tests and backend compile/import/service tests with concurrency cancellation.
- The Preview workflow explicitly checks out `platform-v2-m1-m6`, even when dispatched from `main`.
- The audited baseline run for commit `79eacf7` was green. The final commit must pass a fresh run before EAS is dispatched.

### Render

- Dedicated staging service: `letsgoride-v2-staging` at `https://letsgoride-v2-staging.onrender.com`.
- Staging deploys `platform-v2-m1-m6` and uses `letsgoride_staging`; production was not written during this pass.
- `/health` and `/health/ready` were both HTTP 200 with MongoDB connected at the audited baseline.
- The observed courier GPS failure was a repeated HTTP 422 caused by iOS negative sensor sentinel values. The backend and client now normalize those values and log safe diagnostics.
- The final deploy must be rechecked for readiness, routing status and runtime errors after the final commit.

### Vercel

No LetsGoRide project is deployed on Vercel. The available team projects belong to other products, so Platform V2 has no Vercel dependency.

### Resend

- `letsgoride.site` is verified and the Resend account can send.
- Staging currently reports email configuration as absent. New email signup is therefore a release blocker until `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are configured on the staging service.
- No secret values are recorded in this repository.

### MongoDB Atlas

Atlas access was verified. The staging database is `letsgoride_staging`; the active, cancelled and delivered courier records were inspected without altering their history. Operational indexes are now created idempotently during backend startup, including a unique partial constraint that prevents one courier from owning two active deliveries.

## Staging creation checklist

1. Configure staging Resend variables and verify `/health/email-config` without exposing values.
2. Confirm routing and courier pricing health against real Harare locations.
3. Keep `ENABLE_DEMO_SEED=false` and `MONGODB_DB_NAME=letsgoride_staging`.
4. Push only the audited Platform V2 commit and wait for CI plus Render readiness.
5. Build one iOS Preview binary with the staging API URL after CI is green.
6. Run installed-device QA for auth, rides, courier, food, merchant, notifications and verification.
7. Only then consider merging Platform V2 to `main`.

## Production safety rules

- Never copy staging writes into production automatically.
- Never use production customer data as demo restaurant/courier test data.
- Never expose API keys or database connection strings in GitHub.
- Never disable authentication to make tests pass.
- Never deploy a feature branch directly over the existing production service.
- Keep migration/backfill operations explicit, reversible where possible, and documented.
- Production deploys must be traceable to a GitHub commit.

## Release gates

- CI, Expo Doctor, backend tests and mobile tests must be green.
- Render staging liveness/readiness must be green on the final commit.
- Staging email must be configured before real new-account QA.
- Routing and pricing must fail closed; no invented route, ETA, price or courier payout is permitted.
- One EAS iOS Preview build is allowed only after the final CI run is green.
