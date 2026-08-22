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

## Mobile environment

The mobile app now supports:

- `EXPO_PUBLIC_API_BASE_URL`

If the variable is absent, the app intentionally falls back to the production Render backend for compatibility with existing release builds.

Staging/TestFlight/internal builds must explicitly set `EXPO_PUBLIC_API_BASE_URL` to the staging backend.

## Current infrastructure audit — 2026-08-22

### GitHub

- Platform V2 work is isolated in draft PR #1.
- `main` remains the production branch.
- CI covers mobile typecheck/tests and backend compile/import/service tests.
- CI uses concurrency cancellation to avoid large stale queues.

### Render

- Production LetsGoRide backend exists and auto-deploys from `main`.
- Production backend is healthy enough to serve active mobile requests.
- Recent observed successful routes include `/auth/me`, `/rides`, `/notifications`, `/requests/my`, `/conversations`, `/reviews/pending`, and `/verification/me`.
- Some unauthenticated requests correctly return `401`.
- No dedicated LetsGoRide staging backend was found during this audit.
- Pull-request previews are not enabled for the current production service.

### Vercel

No LetsGoRide project is currently deployed on Vercel. Existing Vercel projects belong to other products. LetsGoRide does not need to move to Vercel merely because access exists; use the platform that fits each workload.

### Resend

- `letsgoride.site` is verified.
- Sending is enabled.
- Recent LetsGoRide verification emails are being delivered.
- No Resend webhooks are currently configured.

### MongoDB Atlas

Atlas MCP access is currently blocked at the organization level. An Organization Owner must enable AI client/MCP access before the Atlas connector can inspect projects, clusters, databases, indexes, or alerts directly.

Until that is enabled, do not guess Atlas topology or make database changes based only on application code.

## Staging creation checklist

1. Enable MongoDB Atlas MCP access for the organization.
2. Inspect the existing Atlas project/cluster and identify the production database name.
3. Create a dedicated staging database (preferred initially over a paid second cluster unless isolation requirements justify one).
4. Create a dedicated Render staging web service from `platform-v2-m1-m6`.
5. Configure only staging secrets and the staging MongoDB database.
6. Set `PUBLIC_API_BASE_URL` to the staging Render URL.
7. Keep `ENABLE_DEMO_SEED=false` unless a dedicated deterministic staging seed is intentionally implemented.
8. Build a staging mobile binary with `EXPO_PUBLIC_API_BASE_URL=<staging backend>`.
9. Run smoke tests for auth, rides, courier, food, merchant, notifications, and verification.
10. Only after green CI + staging QA should Platform V2 be considered for merge to `main`.

## Production safety rules

- Never copy staging writes into production automatically.
- Never use production customer data as demo restaurant/courier test data.
- Never expose API keys or database connection strings in GitHub.
- Never disable authentication to make tests pass.
- Never deploy a feature branch directly over the existing production service.
- Keep migration/backfill operations explicit, reversible where possible, and documented.
- Production deploys must be traceable to a GitHub commit.

## Next infrastructure work

1. Get CI fully green.
2. Enable Atlas MCP access and audit the database/indexes.
3. Provision staging without touching production data.
4. Add health/readiness endpoints and deployment smoke tests if missing.
5. Add routing/geocoding provider abstraction and server-side quote calculation.
6. Add structured observability for Food/Courier state transitions.
7. Add Resend delivery-event webhook handling when needed for transactional email observability.
