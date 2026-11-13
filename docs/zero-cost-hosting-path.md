# LetsGoRide zero-cash hosting and database recovery path (2026-11-13)

## Immediate priority: existing MongoDB data

- Production data is currently in the MongoDB Atlas organization `Deon's Org - 2026-05-17`, organization ID `6a0a5032922dc3e845c6ce9a`, project ID `6a0a5033922dc3e845c6cee7`.
- MongoDB Atlas Admin API cluster listing returned HTTP 402 `Payment Required` (delinquent organization). A MongoDB notification dated November 9 confirmed the suspension and says access-list entries can be removed. An invoice charge notification dated November 6 listed a failed $77.62 charge.
- On November 13 a reply was sent from the organization's mailbox to `cloud-suspension-admin@mongodb.com`, CC `ar@mongodb.com`, asking for preservation, a temporary read-only data export and hardship/no-cost recovery option. This **does not guarantee recovery** and is not equivalent to successful migration.
- Drive search found no file named LetsGoRide, MongoDB, backup or mongodump. Gmail attachment searches found no BSON, archive, GZ, or directly related JSON export. Searches are not an exhaustive inventory.
- Per MongoDB's published rules, after 30 days overdue Atlas can suspend; after 60 days overdue, it may lock and terminate clusters/backups. Any backup or export that can be recovered should be secured before infrastructure cutover.
- Do not create an empty production database, reset accounts or payments, reuse seed fixtures, or bypass suspension by establishing duplicate Atlas accounts in place of legitimate recovery.

## Hosting constraints (no subscription, no card)

| Option | Known cost / constraint | Suitability |
|---|---|---|
| Vercel Hobby | $0; permitted for **personal noncommercial only** per Vercel terms | **Not** for the commercial LetsGoRide production API/website |
| Vercel Pro free trial | Potential 14-day credit; requires payment method; expires | Not a zero-cash permanent home |
| Cloudflare Workers Free + D1 + SQLite-backed Durable Objects | No credit card to start; free daily quotas; Python FastAPI is supported but `Motor`/PyMongo, Redis, Mongo query semantics, payment workers, complex dispatch and realtime routes **cannot be presumed compatible**; Workers Free 10ms CPU per request | Plausible **re-architecture/POC**, not ready to cut over. Requires complete data conversion and tests |
| Supabase Free Postgres | Free 500MB; free project can pause after inactivity. Postgres is *not MongoDB* | Only after writing and testing a full document-to-relational migration, not an API drop-in replacement |
| Render Free / Koyeb Free / Northflank Sandbox / Back4app Free | Advertised as preview/hobby/testing; compute can sleep, have low RAM, do not ensure persistent ride dispatch/settlement | Not production-ready for safety-critical rides |
| Google Cloud Run Free tier | Real free quota; requires Cloud billing account and can charge if over quota | Valid candidate only with billing safeguards and app redesign; cannot promise $0 |
| Owned always-on PC/server + MongoDB Community + FastAPI + Ops + Cloudflare Tunnel | $0 extra hosting subscription on already-owned computer/internet, but electricity, uptime, backups, security and network risks remain; the original Mongo data still must be recovered | Emergency self-host proof of concept, not dependable production without an always-on machine and backup plan |

## Recommended no-cash engineering approach

1. Keep draft PR #143 blocked for merge. No forced Vercel upgrade, payments or DNS changes.
2. Try to recover old MongoDB data through suspension-support reply and any owner-held backups. On successful authorized export, write a repeatable restore script with record counts, byte-level verifications, document ID preservation and indexes.
3. Prototype the API and Ops on a **nonpublic local machine** using Docker Compose and MongoDB Community, with `APP_ENV=development`, dummy non-production database and no live Stripe or public rides. Never run production data in a preview environment.
4. Choose a genuinely sustainable free host **only once its policies, uptime, worker semantics, realtime constraints, storage and quota limits are checked**. Cloudflare Free is promising for a reworked stateless app, but the current Mongo-backed full FastAPI stack cannot simply be deployed unchanged.
5. Refactor ongoing dispatch, lifecycle and settlement into durable tasks. Test concurrency, duplicate prevention, failure recovery and alerts.
6. Switch users only once the complete recovered dataset, service capabilities and commercial hosting compliance are verified. Maintain rollback to a working deployment.

## Source links

- https://www.mongodb.com/docs/atlas/billing/
- https://www.mongodb.com/docs/atlas/support/
- https://vercel.com/legal/terms
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/languages/python/packages/fastapi/
- https://developers.cloudflare.com/durable-objects/platform/pricing/
- https://supabase.com/pricing
