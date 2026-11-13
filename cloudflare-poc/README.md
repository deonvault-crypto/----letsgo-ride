# LetsGoRide · Cloudflare Workers + D1 migration laboratory

**NOT the LetsGoRide production API. NOT a substitute for recovered MongoDB Atlas data.**

This directory is an isolated prototype for moving the existing Zimbabwe ride-hailing, courier, food, operations and payment platform to genuinely free starting infrastructure. Do not merge this branch or point mobile clients, DNS, payment webhooks or `api.letsgoride.site` at the prototype.

## Implemented now

- `src/index.mjs`: a Worker with `GET /health/live` returning 200 but explicitly `production_ready:false`; `GET /health/ready` always returns 503, including when D1 is connected; every other endpoint returns 503 without writing data. Neither passing liveness nor connecting to D1 makes a ride-platform deployment ready.
- `migrations/0001_mongo_archive.sql`: a D1/SQLite **staging** table retaining the original Mongo Extended JSON documents, original typed `_id` and document SHA-256 hashes for checking data integrity. This is not the application relational schema.
- `scripts/ejson-to-d1.mjs`: offline migration preparation for a single recovered MongoDB **Extended JSON NDJSON** export. Produces private, size-bounded SQL INSERT chunks and a manifest. Handles ObjectIds in EJSON without changing them; rejects duplicate/missing IDs and oversized records rather than skipping data. Makes **no** remote or billable calls.
- `test/`: synthetic Node and SQLite tests; no real LetsGoRide records or secrets.
- `.github/workflows/cloudflare-poc-check.yml`: non-deploying CI for the prototype.

## Run the tests for free

```bash
cd cloudflare-poc
npm run check
```

No `npm install`, API token, Atlas account or Cloudflare account is needed to run these checks. Python 3.12+ is required for the SQLite import compatibility test.

## When a real, authorized MongoDB export is available

1. Inventory **every** collection and indexes in the original `letsgoride` database. Do not omit users, credentials, driver payouts, audit logs, payments or event state. Preserve export backups before conversion.
2. Use MongoDB export tooling to produce one Extended JSON object per line (NDJSON). This script **does not** accept raw `mongodump` BSON archive files; convert those using a trusted local tool first.
3. Generate private import chunks in a location excluded from Git:

```bash
node scripts/ejson-to-d1.mjs \
  --collection users \
  --input /private/mongo-export/users.ndjson \
  --output ./generated/users
```

4. Compare every manifest's document count and SHA-256 with the original export. Import **to a separate empty lab D1 database** after applying the table migration. Verify each destination count and document hash before continuing.
5. Build the actual D1 relational business schema and equivalents for Mongo queries/indexes; port user authentication, geospatial matching, ride state transitions, worker leasing, realtime connections and finance idempotency with tests before any production consideration.

Sensitive data: `generated/`, `exports/`, `*.ndjson`, `*.bson`, local Wrangler configuration and credentials are gitignored. Keep these in encrypted local storage; **never commit them**.

## Cloudflare account and deployment (lab only)

There is no Cloudflare account connected to this ChatGPT session, so this repo change does **not** create a real D1 database or deploy a Worker. To deploy the lab later, sign in to a Cloudflare account, create a separate free-tier D1 database named `letsgoride-d1-lab`, copy `wrangler.example.jsonc` to gitignored `wrangler.jsonc` and substitute the actual created database ID for `REPLACE_WITH_YOUR_OWN_CLOUDFLARE_D1_UUID`. Apply only the lab migrations with Wrangler, then deploy to its separate lab hostname. **Never use your actual production domain or real payment secrets.**

The example intentionally contains no real D1 ID. It is not a deployed configuration.

## Capacity and safety

On the November 2026 free plan, Cloudflare Workers includes up to 100,000 requests/day but only 10 ms CPU time per request; free D1 has a 500 MB maximum per database, 100 KB SQL statement limit and 2 MB row/string maximum. The converter deliberately rejects records near the SQL limit. Exceeding D1's daily free quotas causes queries to fail until the quota resets — not acceptable for essential live rides without a documented failover.

**Known blockers:** Atlas organization is suspended for unpaid invoices, production data export not available; current FastAPI uses MongoDB Motor queries and long-running dispatch, lifecycle, notifications and settlement tasks that this Worker has **not** migrated; payment, location, realtime and authentication contracts are not ported. Commercial use, quota and outage response must be reviewed for the final platform.

References:
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/d1/platform/limits/
- https://developers.cloudflare.com/d1/best-practices/import-export-data/

See `docs/zero-cost-hosting-path.md` and draft PR #143 for the overall plan.
