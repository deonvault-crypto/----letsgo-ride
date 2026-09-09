# LetsGoRide Platform V2 — Milestones 1–6

This document is the execution contract for the full platform build.

## Milestone 1 — Premium customer shell

Goal: replace the MVP-feeling app shell with a mature, scalable customer experience without breaking existing Ride functionality.

Deliverables:
- customer nav: Home / Services / Activity / Account
- premium Home with Ride / Food / Courier service entry points
- redesigned Services and Activity surfaces
- Account redesign with clear role/verification logic
- preserve passenger search, booking, messaging, driver trip posting, verification, notifications, safety, and support
- reusable V2 design-system primitives

## Milestone 2 — Courier core

Goal: production-grade parcel delivery lifecycle.

Deliverables:
- delivery quote/request model
- pickup/drop-off + recipient + package details
- delivery status state machine
- courier assignment surface
- delivery detail timeline
- cancellation rules
- audit/event trail
- customer Courier flow connected to real backend

## Milestone 3 — Maps/GPS

Goal: shared location infrastructure for Ride, Courier, and Food.

Deliverables:
- reusable map surface
- location permission flow
- precise pickup/drop-off coordinates
- map pin selection and current location
- provider adapter boundary for geocoding/routing/ETA
- courier presence and live delivery tracking transport
- map-safe empty/offline/error states

## Milestone 4 — Food marketplace

Goal: real Glovo-style restaurant marketplace experience under LetsGoRide branding.

Deliverables:
- restaurant discovery
- search and categories
- restaurant detail
- menu categories/items/options
- basket
- checkout
- order lifecycle
- courier handoff
- activity/history integration

## Milestone 5 — Merchant system

Goal: restaurant/store operating system.

Deliverables:
- merchant onboarding/capabilities
- business profile and opening status
- menu/category/item CRUD
- stock/availability controls
- incoming order queue
- accept/reject/preparing/ready actions
- history and operational metrics foundation
- role-safe merchant authorization

## Milestone 6 — Driver/Courier operations

Goal: premium professional workspace for ride drivers and couriers.

Deliverables:
- capability-based Driver / Courier work modes
- driver calendar and scheduled ride management
- courier online/offline presence
- delivery job offers
- active job map/detail surface
- pickup/drop-off workflow
- navigation handoff
- work history
- earnings-ready event/data foundation
- verification and operational alerts

## Quality bar

Every milestone must satisfy all of the following before merge:
- no regression in existing Ride flows
- TypeScript typecheck passes
- mobile tests pass
- backend tests for new domain logic pass
- state transitions and authorization tested
- deterministic loading, empty, error, offline, and disabled states
- no fake production data presented as live data
- no committed credentials/secrets
- no oversized god components or duplicated domain logic
- responsive across common iPhone and Android widths
- accessible contrast and touch targets
- polished copy, spacing, typography, status hierarchy, and micro-interactions

## Engineering style

This is not a prototype build. New work must prefer:
- thin screens/routers
- reusable primitives
- domain services
- typed API contracts
- explicit enums/state machines
- additive schemas over breaking changes
- provider adapters for replaceable infrastructure
- event/audit trails for operational state changes
- small reviewable commits
