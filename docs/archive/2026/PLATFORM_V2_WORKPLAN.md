# Platform V2 Workplan

This branch is the integration line for milestones 2–6. Individual feature commits should remain small, reviewable, and reversible.

## Sequence

### M2 — Courier core
- backend delivery models and state machine
- delivery service and customer/courier endpoints
- mobile courier customer shell connected to real API
- delivery detail/status timeline
- unit tests for lifecycle/authorization

### M3 — Maps/GPS
- coordinate/address value objects
- permission-safe mobile location hooks
- reusable map surface
- courier presence and delivery tracking transport
- map provider adapter boundary

### M4 — Food marketplace
- merchant discovery/read models
- menu/category/item models
- customer cart and food order lifecycle
- restaurant/menu/cart/checkout mobile screens

### M5 — Merchant system
- merchant capability/ownership model
- catalog management APIs
- order accept/reject/preparing/ready actions
- merchant operational UI surface

### M6 — Driver/Courier operations
- unified work profile and capability model
- ride-driver availability calendar
- courier online/offline presence and job offers
- operational map/job detail surfaces
- history and earnings-ready event stream

## Merge discipline

- Keep current Ride behavior intact.
- Prefer additive schemas and adapters over breaking existing payloads.
- No direct writes to `main` while a milestone is in progress.
- Every milestone requires tests and a manual-screen checklist before merge.
