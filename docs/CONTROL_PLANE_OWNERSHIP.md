# LetsGoRide control-plane ownership

This document defines the intended ownership boundary for the three production control-plane API families. It is an architectural guide, not a route migration. Existing public routes remain supported until their callers are deliberately migrated.

## `/admin`

**Owner:** platform administration.

Use `/admin` for privileged platform-level administration that is not part of a worker's normal product workflow: user/account administration, platform verification decisions, platform-wide ride/report administration, and other administrator-only controls.

Do not add ordinary Driver, Courier, Merchant, or Customer self-service flows here.

## `/ops`

**Owner:** Customer Support and live operations.

Use `/ops` for the dedicated operations control center: staff identity/permissions, support queues and conversations, live operational state, incident/case handling, realtime operational views, and controls used by `ops-web`.

New Ops Web features should prefer this namespace when the action belongs to the live control center rather than general platform administration.

## `/operations`

**Owner:** workforce/product operations.

Use `/operations` for worker-facing operational APIs and their closely related administration: Driver/Courier/Merchant applications, workforce documents, Courier shifts/deliveries, and other product-workflow operations.

Do not turn `/operations` into a second general admin or CS API.

## Client ownership

- **Ops Web (`ops-web`)** is the primary operational control center for Customer Support, live operations, safety/incident work, and staff workflows.
- **Mobile Admin (`mobile/app/(admin)`)** remains supported. It should stay focused on compact administrator access and should not automatically duplicate every new Ops Web feature.
- **Mobile worker/customer surfaces** use product APIs and must not depend on Ops-only endpoints.

## Migration rule

Do not mass-rename production routes. When functionality is found in the wrong namespace:

1. Introduce or identify the canonical route.
2. Migrate all current callers.
3. Keep the old route as a bounded compatibility path when a published app may still call it.
4. Measure or otherwise prove the old route is no longer required.
5. Remove the compatibility path in a separate reviewed change.

This avoids turning architectural cleanup into an accidental breaking API release.
