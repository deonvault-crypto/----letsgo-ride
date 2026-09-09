# LetsGoRide Platform V2 Architecture

Status: production architecture reference for the `platform-v2-m1-m6` source line.

## Product domains

LetsGoRide is evolving into one platform with separate but connected domains:

1. **Ride** — scheduled/shared intercity rides.
2. **Courier** — on-demand parcel delivery.
3. **Maps & live location** — geocoding-ready pickup/drop-off coordinates, courier presence, route/ETA surfaces, and live tracking transport.
4. **Food** — restaurant discovery, menus, cart, checkout, order lifecycle, and delivery handoff.
5. **Merchant** — restaurant/store onboarding, catalog, availability, order operations, and analytics-ready data.
6. **Driver/Courier Operations** — driver calendars, future ride schedules, courier online/offline presence, job queue, navigation handoff, earnings-ready events, and operational history.

## Engineering rules

- Existing Ride flows remain backward compatible.
- Domain logic belongs in service modules; routers/screens stay thin.
- API resources use explicit lifecycle states instead of free-form strings.
- State transitions are validated server-side.
- Money is represented in integer minor units where new commerce APIs are introduced.
- Geographic coordinates use GeoJSON order: `[longitude, latitude]` in backend persistence.
- Customer, courier, merchant, and driver roles are permissions/capabilities on one user identity, not separate user databases.
- No fake tracking, fake restaurant inventory, or fake live courier data is presented as production data.
- Mobile feature surfaces must support empty/loading/error states.
- New code should be testable without a running MongoDB instance by keeping the repository's existing in-memory database fallback.
- Secrets, provider keys, signing material, and production credentials must never be committed.

## Milestone 2 — Courier core

Core resources:

- `delivery_quotes`
- `deliveries`
- `delivery_events`

Delivery lifecycle:

`draft -> requested -> assigned -> courier_to_pickup -> at_pickup -> picked_up -> courier_to_dropoff -> delivered`

Terminal states:

`cancelled`, `failed`

A delivery records immutable customer intent (pickup/drop-off, package description, recipient contact) and operational state separately. Every accepted status transition produces an event.

## Milestone 3 — Maps/GPS

Core resources:

- `courier_locations`
- `delivery_tracking_sessions`

The backend stores the latest courier location separately from historical delivery events. Location writes are permission-checked and timestamped. Mobile map components never manufacture a courier position.

Provider-specific routing/geocoding remains behind adapters so LetsGoRide can switch providers without rewriting product screens.

## Milestone 4 — Food marketplace

Core resources:

- `merchants`
- `merchant_locations`
- `menu_categories`
- `menu_items`
- `carts`
- `food_orders`
- `food_order_events`

Food order lifecycle is intentionally separate from delivery lifecycle. A food order can be accepted/prepared before a courier delivery is assigned.

## Milestone 5 — Merchant system

Merchant capabilities include profile management, opening state, catalog management, item availability, incoming order actions, and order history. Merchant authorization is checked server-side on every write.

## Milestone 6 — Driver/Courier operations

Core resources:

- `work_profiles`
- `availability_windows`
- `courier_presence`
- `job_offers`
- `work_events`

Ride-driver schedule management and real-time courier work share visual language but remain distinct workflows.

## Mobile design system direction

The UI should feel premium, quiet, highly legible, and intentional:

- warm-white / white surfaces
- near-black typography
- restrained LetsGoRide green only for action, active state, verification, and success
- large type hierarchy with generous whitespace
- minimal borders and shadows
- strong empty/loading/error states
- fluid cards and sheets rather than dense boxed forms
- consistent motion-ready state changes (without depending on decorative animation)
- accessible touch targets and safe-area spacing

The product should not visually imitate Uber or Glovo. It should use the interaction clarity of mature mobility/delivery products while remaining recognizably LetsGoRide.

## API conventions for new domains

- Base prefix: `/api/...`
- User-facing collections expose opaque string IDs.
- Server timestamps are UTC ISO-8601.
- State-changing actions use explicit action endpoints when they represent business transitions rather than generic CRUD.
- New endpoints authenticate using the repository's existing auth dependency.
- Responses should not expose internal Mongo `_id` values.

## Delivery status transition policy

Allowed forward transitions are narrowly defined. Cancellation is role- and state-aware. Delivered deliveries cannot be reopened through the public API. Courier assignment and delivery-state actions are auditable through `delivery_events`.

## Quality gates

Before merging each milestone:

- TypeScript typecheck passes.
- Mobile tests pass.
- Backend tests for new state transitions and authorization pass.
- Existing Ride endpoints and screens remain compatible.
- No provider credential is required merely to render the app.
- New API surfaces have deterministic empty states and error handling.
