# LetsGoRide 🇿🇼 — fresh-start API (staging only)

This is a **new database and API**, isolated from the production app and the MongoDB recovery lab. It must NOT be used as a drop-in replacement for the current Expo mobile app. No existing account, ride, payment, audit or finance data is copied or deleted.

**Production readiness intentionally returns HTTP 503.** Existing production branch, EAS app builds, DNS, provider webhooks, Render and Vercel settings have not been changed.

## What exists in this branch

- New relational D1 schema for password-backed accounts, email challenges, revocable sessions, driver applications, presence, quotes, cash trips, atomic dispatch offers and audited admin decisions
- Routes using the existing mobile envelope `{success,data|error}`: `/auth/email-register`, `/auth/resend-email-verification`, `/auth/verify-email`, `/auth/email-login`, `/auth/me`, `/auth/logout`, `/auth/work-mode`
- Trial driver application `/drivers/application`, cash-only simulated `/hailing/quotes`, `/hailing/trips`, `/hailing/trips/active`, `/hailing/trips/:id`, `/hailing/trips/:id/cancel`
- Trial `/hailing/driver/online`, `/hailing/driver/presence`, `/hailing/driver/offline`, `/hailing/driver/offer`, `/hailing/offers/:id/accept`
- Existing mobile admin-facing `/admin/overview`, `/admin/verifications`, `/admin/verifications/:id/status`, `/admin/hailing/drivers`, `/admin/audit-logs`
- Test-only simulated fares, not road ETA or production pricing. **No card charges or payouts.** Unsafe, unmigrated routes return 503.

## Important restrictions

- Driver approval **requires documents_verified=1** but no public document upload/review workflow exists yet. A test may seed this field in a disposable database, but a production operator must NOT bypass it. Until private document storage/access/review are implemented, real driver approval is blocked.
- Admin accounts are NEVER auto-created or accepted from public registration. An operator must provision a verified identity using authenticated private database administration and record the action. This procedure will need full privileged access hardening before launch.
- Passwords use PBKDF2-SHA256 with a 210,000-iteration work factor, random per-user salt, and hashed bearer tokens. This must pass Cloudflare Workers CPU/free-tier tests before deployment. Implement request abuse protection and scale testing, not just local unit tests.
- Email verification uses a trusted mail provider. Configure `RESEND_API_KEY` and a verified `MAIL_FROM` address as Workers secrets. `AUTH_PEPPER` must be a separate strong random secret, 32+ characters; do not commit or print it.
- The `SIMULATED_RIDES` flag must remain **disabled** in any real-money or public production environment. The Haversine estimate is not a road route or acceptable fare quote.
- Existing mobile clients need additional endpoints (trip PIN, arrival/start/complete lifecycle, push and realtime, verified documents, support, activity, courier, food, actual routing, maps and payments) before they can use this API.
- Add secured operational backups, quota alerts, Stripe webhook ledger reconciliation and a tested rollback destination before real usage.

## Tests

From this folder, with Node 24 and internet access for the initial dependency installation:

```bash
npm ci --no-audit --no-fund
npm run check
```

`test/staging.test.mjs` runs against a fresh disposable local D1 database through Miniflare and checks non-readiness, validation, unauthenticated access, email verification, revocation, admin restrictions, simulated passenger quote/trip, approved driver offer, replay and cancellation. No live services or keys are needed for the tests.

## Cloudflare account setup — only after signing in

1. In Cloudflare, create a **new, empty** staging D1 database called `letsgoride-fresh-staging`; do not reuse the Mongo archive or production bindings.
2. Copy `wrangler.example.jsonc` to ignored `wrangler.jsonc`; insert the new D1 database ID. Keep Workers `workers_dev` and `preview_urls` false. Do not deploy public routes.
3. In the private staging environment, set `AUTH_PEPPER`, `RESEND_API_KEY` and `MAIL_FROM` using Cloudflare secrets; do not add them to the Git repository or chat.
4. Apply migrations to the **new, disposable staging database** only after a successful test run and inspect expected table inventory. Follow provider limits before allocating any production resources.
5. Run a private end-to-end test on passenger registration and OTP email, driver application, document verification, admin decision and a simulated ride. All real integrations must pass separately.

Vercel already has a LetsGoRide API project, but the free Vercel Hobby plan is restricted to personal/noncommercial workloads. Do not silently switch a commercial ride API to Hobby as a zero-cost production solution. Cloudflare Workers/D1 Free may be suitable for early usage under capacity and availability limits; verify quotas and Zimbabwe network latency first.

## Remaining release gates

1. Run these tests on a real local or remote Node/Miniflare environment and correct failures. GitHub Actions account billing lock currently prevents a reliable CI signal.
2. Complete secure private-document onboarding and admin verification inside the existing mobile app.
3. Implement road routing, actual pricing, safe multi-step dispatch, PIN, completion, location, support, notifications and provider mocks with mobile-contract tests.
4. Repair the mobile dependency audit; complete provider sandbox tests and realistic load/reconnect tests.
5. Deploy to a separately authenticated **staging** Worker and verify the real D1 schema. Add a verified backup and fallback target.
6. ONLY after the full gate: explicitly approve changing production routing, mobile releases, DNS and webhooks. No production cutover is part of this PR.
