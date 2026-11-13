# LetsGoRide Cloudflare migration lab

This directory supports isolated development with synthetic records. The deployable entry point, `src/index.mjs`, exposes liveness and reports HTTP 503 for readiness and all product routes. The business test Worker under `test/fixtures/` runs only through Miniflare. The sample Wrangler configuration disables both public workers.dev and preview URLs.

## Run the Worker, D1 and recovery tests

Use Node 24, Python 3.12, and the same PyMongo version as the FastAPI backend.

```bash
npm ci --no-audit --no-fund
python -m pip install 'pymongo==4.9.2' 'pytest==8.4.2'
npm run check
python -m pytest -q test/test_recover_mongo.py
```

Miniflare starts the Workers runtime with isolated D1 and SQLite-backed Durable Objects. The tests cover geographical eligibility, concurrent driver assignment, offer expiration, outbox lease recovery, financial replay and recipient-scoped WebSocket delivery. They use generated records, a fixture identity map and no provider credentials.

To run the deployable health Worker locally, copy `wrangler.example.jsonc` to the ignored `wrangler.jsonc` and use a placeholder UUID such as `00000000-0000-4000-8000-000000000001`. Run the following with Wrangler 4.161.0.

```bash
npx wrangler@4.161.0 d1 migrations apply DB --local
npx wrangler@4.161.0 dev --local --ip 127.0.0.1
```

`GET /health/live` should return 200. `GET /health/ready` should return 503 with `database_status: connected` and `production_ready: false`. A remote smoke requires a signed-in Cloudflare account on Workers Free and a dedicated D1 binding. Keep lab resources free of production data and keep the test entry point out of the deployable bundle.

## Recover the MongoDB snapshot

Obtain a consistent, authorized Atlas snapshot or BSON dump. Preserve the original and its hashes in encrypted, access-controlled storage. When export access is restored, record the source collection inventory, counts, and collection options at the same snapshot point. A file inventory alone cannot establish that Atlas supplied every collection.

`recover_mongo.py` accepts the uncompressed `letsgoride/` database directory from an authorized dump or a new dump of an isolated, successfully restored snapshot. Preserve the full backup if it contains an oplog, compressed archive, or other namespaces. Replay a valid oplog using MongoDB's documented restore procedure before creating the staging directory. Stage the dump and verify its contents locally in the protected workspace.

```bash
umask 077
python scripts/recover_mongo.py stage /private/snapshot/letsgoride /private/recovery/letsgoride.sqlite3
python scripts/recover_mongo.py verify /private/snapshot/letsgoride /private/recovery/letsgoride.sqlite3
python scripts/recover_mongo.py export-ejson /private/recovery/letsgoride.sqlite3 users /private/recovery/users.ndjson
```

The archive stores each raw BSON document with its typed ID, collection and document SHA-256, and MongoDB metadata including index definitions and supported views. Verification compares the stored bytes, metadata, order, and counts against the supplied snapshot. Repeat the inventory comparison against the authorized source. Preserve the raw BSON as the recovery copy because Extended JSON has representation and row-size constraints.

Use the EJSON converter with canonical Extended JSON for synthetic D1 import or offline transformation. Its chunks contain the source payloads. Keep recovered customer exports in the protected offline workspace and out of the Cloudflare lab.

```bash
node scripts/ejson-to-d1.mjs \
  --collection users \
  --input /private/synthetic/users.ndjson \
  --output ./generated/users
```

The converter refuses duplicate typed IDs within a canonical export, empty files, and statements approaching D1's 100 KB cap. A final manifest contains document counts and chunk SHA-256 values. The D1 archive schema stores documents for staging. The live application requires relational mappings and reconciliation for stable application IDs, lifecycle state, payments, audit and user access.

## Run the FastAPI recovery smoke

The fixture exercises the existing API against a **fresh, disposable** MongoDB Community database and Redis on loopback. Install the backend dependencies, `httpx==0.28.1`, and start the two local services before running it from the repository root.

```bash
env -i PATH="$PATH" PYTHONPATH="$PWD/backend" APP_ENV=test MONGODB_DB_NAME=letsgoride \
  MONGODB_URI=mongodb://127.0.0.1:27867 REALTIME_REDIS_URL=redis://127.0.0.1:26387 \
  RATE_LIMIT_REDIS_URL=redis://127.0.0.1:26387 STRIPE_ENABLED=false \
  PASSENGER_CARD_PAYMENTS_ENABLED=false ADMIN_AUTO_CREATE=false ROUTING_PROVIDER=disabled \
  COURIER_AUTO_PRICING_ENABLED=true COURIER_BASE_PRICE_USD=2 COURIER_PRICE_PER_KM_USD=0.5 \
  COURIER_MINIMUM_PRICE_USD=2 COURIER_PAYOUT_PERCENT=70 \
  timeout 45s python cloudflare-poc/test/fixtures/fastapi-recovery-smoke.py
```

See [the migration runbook](../docs/zero-cost-hosting-path.md) for provider quotas, recovery sequence and production gates.
