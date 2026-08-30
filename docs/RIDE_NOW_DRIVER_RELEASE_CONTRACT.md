# Ride Now Driver release contract

Last updated: 2026-08-30
Baseline release-candidate SHA: `b86ae305645f2afbe7b73ba841918c149106f6fb`
Marketing version: `2.0.2`

## Product contract

The Driver Ride Now experience is map-first. The map is the primary surface while offline, online, receiving an offer, driving to pickup, at pickup, during the trip, and after completion. Status and actions float over the map rather than replacing it with a page-first workflow.

Incoming requests must appear over the map with pickup, destination, fare, distance, Accept, and Decline. Active Ride Now trips must remain map-first with passenger information, navigation, Arrived, Start Trip, Complete Trip, messaging, cancellation, and safety-related controls positioned around the map.

Realtime is the primary state-delivery mechanism. Driver offers and trip-state changes must arrive through the authenticated WebSocket/realtime channel without requiring manual refresh. Native push remains the background fallback. Polling may exist only as recovery when realtime is unavailable; it must not be the normal interaction model.

Driver location must update continuously during the appropriate Ride Now lifecycle states, including supported background tracking during an active trip.

Normal Ride Now trips must not require a passenger to press a manual "I'm in" / boarding-confirmation button before the driver can start. After the driver has arrived and the safety conditions are satisfied, the driver may start the trip directly. The optional safety PIN remains available only when the passenger deliberately enables it; it is not a mandatory boarding gate.

## Release and environment contract

Production Ride Now remains controlled by the production feature flag. Staging/TestFlight validation must not require enabling production hailing.

TestFlight builds used for this release line must point at the staging backend until the release candidate is explicitly approved for production.

Build `29` (EAS build ID `76d6bee5-5dca-4f3c-9df9-c428388bd402`) is superseded because it inherited the stale visible version `2.0.0` and must not be treated as the release candidate.

The corrected release line is `LetsGoRide 2.0.2`. The authoritative source SHA for that correction is `b86ae305645f2afbe7b73ba841918c149106f6fb`.

The authoritative Platform V2 CI run for that SHA completed successfully on 2026-08-30. Backend, TypeScript, Android policy, full mobile unit tests, and release checks passed.

The next intended TestFlight candidate is therefore `2.0.2 (30)` built from the validated `b86ae305...` source line or a direct descendant containing only reviewed release changes. Build 29 remains superseded.

## Engineering rules

- Do not reintroduce a page-first Driver Ride Now trip experience.
- Do not make manual refresh the normal way a driver receives offers or state changes.
- Do not reintroduce mandatory passenger boarding confirmation for normal rides.
- Do not remove optional PIN safety when it is explicitly enabled.
- Do not point staging/TestFlight QA builds at production APIs.
- Do not ship a TestFlight candidate with a marketing version older than the currently distributed TestFlight version.
- Prefer one authoritative implementation over parallel v1/v2 paths or duplicated state machines.
