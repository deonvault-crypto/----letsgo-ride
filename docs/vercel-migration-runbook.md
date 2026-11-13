# LetsGoRide: Render → Vercel migration checkpoint (2026-11-13)

> **Blocked for production cutover.** This is a migration preparation branch, **not authorization to merge, promote, change the mobile API, delete Render services, or modify production MongoDB data.**

## Verified inventory

- Production branch: `platform-v2-m1-m6`; source revision deployed to Vercel: `5cb535636d3ccdc8513dbec6cb6f9c5a26f50cf5`.
- Existing Vercel team: `QuickBox` (Hobby). Commercial production requires a suitable paid plan.
- Existing Vercel FastAPI project: `letsgoride-api`. Its current deployment returns HTTP 200 on `/health/live`, but HTTP 503 on `/health/ready` with `database_status=not_configured`.
- Verified Vercel project domain assignment: `api.letsgoride.site`. Domain assignment is **not** proof the app or DNS is ready.
- No environment variables were configured on the Vercel API project when checked.
- Existing MongoDB Atlas project: `6a0a5033922dc3e845c6cee7`. Atlas cluster inspection returned HTTP 402, reporting a delinquent organization. **Do not migrate or reset any data until billing/access is restored.**
- Render API and Ops web services reported suspended for billing reasons; the prior application code used `letsgoride-v2-production.onrender.com` for the mobile API and Operations WebSockets.
- Public website source is separately maintained on `website-production`; do not merge or overwrite it while moving the API.

## Before any switch

1. Restore Atlas billing/access and verify that the existing production database `letsgoride` is readable, with a backup/restore point and collection/index inventory. Keep existing user IDs, ride/trip state, sessions, ledger and payout data.
2. Move the QuickBox team to a plan permitting LetsGoRide commercial use. Review projected Functions/transfer/worker/Redis costs before enabling billing-dependent features.
3. Configure production secrets **in Vercel Environment Variables**, never in Git or artifacts: `APP_ENV=production`, `MONGODB_URI`, `MONGODB_DB_NAME=letsgoride`, `PUBLIC_API_BASE_URL=https://api.letsgoride.site`, explicit trusted `CORS_ORIGINS`, Cloudinary credentials, Resend credentials, Google Maps configuration, existing Redis transport/rate-limit settings, payout encryption, Stripe account binding/secrets and webhook signatures, and operational feature flags. Set only credentials that belong to the real production accounts.
4. The current FastAPI startup creates a Mongo-leased **continuous worker supervisor**. Do **not** rely on its asyncio tasks to run indefinitely within ephemeral Vercel request Functions. Refactor settlement, ride lifecycle, communications, hailing dispatch and Stripe reconciliation into **durable queue/worker/cron executions with verified ownership and catch-up semantics**; keep atomic Mongo protections and no duplicate settlement.
5. Verify WebSocket `/realtime` end to end, including reconnect after max Function duration, Redis pub/sub fan-out and authenticated Ops/mobile subscribers. Health should only report ready after all critical dependencies are ready.
6. Verify API endpoints, payments and Stripe webhooks, Cloudinary uploads, notifications, auth, live trip tracking, and a real authenticated Ride Now ride across two devices. Verify Operations login, support, moderation and live map.
7. Only **after** step 6: update the code-pinned mobile production API origin, its tests and CI smoke target, Ops API and WS origins, DNS and CORS. Use a controlled release/OTA with existing no-extra-native-build rule respected until specifically approved. Confirm installed clients can use the new endpoint.
8. Keep Render configured as a rollback fallback until measured production cutover and historical client transition are complete. **Do not delete Render or Mongo resources automatically.**

## Ops dashboard static deployment preparation

A new `ops-web/vercel.json` config supports deployment with project Root Directory `ops-web`, Build Command `npm run check`, Output Directory `public`, and an external rewrite from `/api/*` to `https://api.letsgoride.site/*`. This is preparatory only: the Operations WebSocket clients still need their hard-coded origins changed to the new `wss://api.letsgoride.site/realtime` once verified, or they will keep trying Render. Never assume a static rewrite upgrades WebSockets.

## Launch gate

- `GET https://api.letsgoride.site/health/live` → HTTP 200
- `GET https://api.letsgoride.site/health/ready` → HTTP 200, `database_status=connected`, `realtime_status=ready`, `profile_storage_status=ready`.
- Authenticated passenger/driver functional test and Ops functional test both pass.
- Worker heartbeat, idle/expired rides, dispatch and payments reconciliations prove reliable on Vercel even with no active HTTP request.
- All exact-SHA CI and storefront legal/health endpoints pass.
- No billing blocker or 402 from Atlas and no required Render URL in shipping configuration.

**Status as of this checkpoint: BLOCKED — Atlas 402, no Vercel production env, worker migration unimplemented, Vercel commercial plan not enabled.**
