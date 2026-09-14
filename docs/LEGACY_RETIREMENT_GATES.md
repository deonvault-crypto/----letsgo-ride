# Legacy compatibility retirement gates

LetsGoRide carries several compatibility paths that look removable but still protect published clients or historical production data. They must not be deleted merely because they contain words such as `legacy`, `old`, or a historical build number.

## Ride `legacy_status`

**Current state:** still read/written across backend ride serialization/realtime and supported mobile ride UI/realtime.

**Removal gate:**

- every supported installed app version understands the canonical ride status model;
- no supported client requires `legacy_status` in API/realtime payloads;
- mobile fallbacks have been removed and observed safely before backend emission is removed.

**Retirement order:** mobile fallback -> observation window -> backend payload field.

## Courier Build-35 presence compatibility

**Current state:** `_legacy_presence()` exists for Courier profiles created before presence/location state was introduced.

**Removal gate:**

- all production Courier profiles have canonical presence/location state, or are deliberately inactive;
- the count of profiles requiring the compatibility fallback is zero.

Backfill production data through a separately reviewed migration before deleting the code.

## `legacy_local_document`

**Current state:** historical private verification documents can still be resolved from bounded legacy local storage; security tests intentionally protect path containment.

**Removal gate:**

- inventory every production record with `legacy_local_document == true`;
- migrate each file to canonical private provider storage;
- verify content, authorization, and retrieval after migration;
- production legacy-document count is zero.

Never remove the fallback before the files are migrated and verified.

## Legacy password hashes

**Current state:** authentication intentionally accepts older PBKDF2 configurations so dormant users are not locked out.

**Removal gate:**

- transparently rehash old credentials on successful login;
- measure remaining legacy hashes;
- either reach zero or deliberately force a password-reset migration for the remainder.

Authentication compatibility is security-sensitive and must be removed only in a dedicated change.

## `driver_applications`

**Current state:** the modern workforce model uses `worker_applications`, but historical Driver onboarding still has readers/writers around `driver_applications`, including verification/consistency/account-deletion compatibility.

**Removal gate:**

- identify every current writer and reader;
- prove supported mobile clients no longer call the legacy Driver application endpoint;
- migrate any authoritative historical approval/document state needed by current accounts;
- stop new writes first and keep a bounded read-only compatibility period;
- remove the collection dependency only when no supported client or production record requires it.

Do not drop the MongoDB collection as part of ordinary code cleanup.

## Support `admin_notes`

**Current state:** older staff replies may exist only in `support_messages.admin_notes`; the conversation layer synthesizes a `legacy-staff-reply` when no persisted public staff thread message exists.

**Removal gate:**

- migrate all historical `admin_notes` that represent customer-visible replies into canonical thread-message rows;
- verify ordering, sender visibility, and full support history;
- production tickets requiring the synthetic reply path are zero.

The migration must be idempotent and separately reviewed. Ordinary code cleanup must not mutate production support history.

## General rule

A compatibility path may be retired only when its objective gate is satisfied. Prefer a two-step retirement:

1. stop creating new legacy data / stop supported clients from consuming the old shape;
2. after an observation or migration window, remove the compatibility reader.

This keeps code cleanup from becoming a breaking production migration.
