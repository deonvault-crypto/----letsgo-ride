import type { LiveTripState, Ride, RideRequest, RideStatus } from "../types/ride.types";
import type { RealtimeEventEnvelope } from "../types/realtime.types";
import { decideRealtimeVersion, normalizeRealtimeVersion } from "./realtimeResource";


const RIDE_EVENTS = new Set(["ride.created", "ride.updated", "ride.status_changed", "ride.location_updated", "ride.terminal"]);
const REQUEST_EVENTS = new Set(["ride_request.created", "ride_request.updated", "ride_request.terminal"]);
const TERMINAL_RIDES = new Set(["COMPLETED", "CANCELLED", "EXPIRED", "completed", "cancelled", "closed"]);
const TERMINAL_REQUESTS = new Set(["declined", "cancelled", "cancelled_by_passenger", "cancelled_by_driver", "cancelled_by_admin"]);
const RIDE_FIELDS: Array<keyof Ride> = [
  "status", "legacy_status", "driver_user_id", "driver_name", "vehicle", "origin", "destination",
  "pickup_note", "dropoff_note", "date", "time", "price_usd", "available_seats",
  "estimated_duration_minutes", "live_tracking_active", "last_driver_location", "boarding_started_at",
  "started_at", "completed_at", "cancelled_at", "expired_at", "created_at", "updated_at",
];
const REQUEST_FIELDS: Array<keyof RideRequest> = [
  "ride_id", "user_id", "passenger_name", "passenger_profile_photo_url", "passenger_verification_status",
  "passenger_note", "seats", "status", "checked_in", "checked_in_at", "driver_decision_reason",
  "cancellation_reason", "driver_cancellation_reason", "admin_cancellation_reason", "ride_snapshot",
  "created_at", "updated_at",
];

export type ResourceEventResult<T> = { value: T; applied: boolean; needsReconciliation: boolean };

export function applyRideEvent(current: Ride, event: RealtimeEventEnvelope): ResourceEventResult<Ride> {
  const ignored = { value: current, applied: false, needsReconciliation: false };
  if (event.resource_type !== "ride" || event.resource_id !== current.id || !RIDE_EVENTS.has(event.type)) return ignored;
  const decision = decideRealtimeVersion(current.realtime_version, event);
  if (decision === "ignore") return ignored;
  if (decision === "reconcile") return { ...ignored, needsReconciliation: true };
  const incomingStatus = event.payload.status;
  if (isTerminalRide(current.status) && typeof incomingStatus === "string" && !isTerminalRide(incomingStatus)) {
    return { ...ignored, needsReconciliation: true };
  }
  const ride = { ...current, realtime_version: event.version } as Ride;
  for (const field of RIDE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(event.payload, field)) Object.assign(ride, { [field]: event.payload[field] });
  }
  applyLifecycleFlags(ride);
  return { value: ride, applied: true, needsReconciliation: false };
}

export function rideFromEvent(event: RealtimeEventEnvelope): Ride | null {
  if (event.resource_type !== "ride" || !RIDE_EVENTS.has(event.type) || event.payload.id !== event.resource_id) return null;
  if (normalizeRealtimeVersion(event.payload.realtime_version) !== event.version) return null;
  if (
    typeof event.payload.origin !== "string" || typeof event.payload.destination !== "string"
    || typeof event.payload.status !== "string" || typeof event.payload.available_seats !== "number"
  ) return null;
  const ride = { id: event.resource_id, realtime_version: event.version } as Ride;
  for (const field of RIDE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(event.payload, field)) Object.assign(ride, { [field]: event.payload[field] });
  }
  applyLifecycleFlags(ride);
  return ride;
}

export function applyRideRequestEvent(current: RideRequest, event: RealtimeEventEnvelope): ResourceEventResult<RideRequest> {
  const ignored = { value: current, applied: false, needsReconciliation: false };
  if (event.resource_type !== "ride_request" || event.resource_id !== current.id || !REQUEST_EVENTS.has(event.type)) return ignored;
  const decision = decideRealtimeVersion(current.realtime_version, event);
  if (decision === "ignore") return ignored;
  if (decision === "reconcile") return { ...ignored, needsReconciliation: true };
  const incomingStatus = event.payload.status;
  if (TERMINAL_REQUESTS.has(current.status) && typeof incomingStatus === "string" && !TERMINAL_REQUESTS.has(incomingStatus)) {
    return { ...ignored, needsReconciliation: true };
  }
  const request = { ...current, realtime_version: event.version } as RideRequest;
  for (const field of REQUEST_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(event.payload, field)) Object.assign(request, { [field]: event.payload[field] });
  }
  return { value: request, applied: true, needsReconciliation: false };
}

export function rideRequestFromEvent(event: RealtimeEventEnvelope): RideRequest | null {
  if (event.resource_type !== "ride_request" || !REQUEST_EVENTS.has(event.type) || event.payload.id !== event.resource_id) return null;
  if (normalizeRealtimeVersion(event.payload.realtime_version) !== event.version) return null;
  if (typeof event.payload.ride_id !== "string" || typeof event.payload.status !== "string" || typeof event.payload.passenger_name !== "string") return null;
  const request = { id: event.resource_id, realtime_version: event.version } as RideRequest;
  for (const field of REQUEST_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(event.payload, field)) Object.assign(request, { [field]: event.payload[field] });
  }
  return request;
}

export function applyLiveTripEvent(current: LiveTripState, event: RealtimeEventEnvelope): ResourceEventResult<LiveTripState> {
  const ignored = { value: current, applied: false, needsReconciliation: false };
  if (event.resource_type !== "ride" || event.resource_id !== current.ride_id || !RIDE_EVENTS.has(event.type)) return ignored;
  const decision = decideRealtimeVersion(current.realtime_version, event);
  if (decision === "ignore") return ignored;
  if (decision === "reconcile") return { ...ignored, needsReconciliation: true };
  const incoming = event.payload.status;
  if (isTerminalRide(current.status) && typeof incoming === "string" && !isTerminalRide(incoming)) return { ...ignored, needsReconciliation: true };
  const next: LiveTripState = {
    ...current,
    realtime_version: event.version,
    status: typeof incoming === "string" ? incoming as RideStatus : current.status,
    live_tracking_enabled: Object.prototype.hasOwnProperty.call(event.payload, "live_tracking_active")
      ? Boolean(event.payload.live_tracking_active)
      : current.live_tracking_enabled,
    last_driver_location: Object.prototype.hasOwnProperty.call(event.payload, "last_driver_location")
      ? event.payload.last_driver_location as LiveTripState["last_driver_location"]
      : current.last_driver_location,
  };
  if (isTerminalRide(next.status)) next.live_tracking_enabled = false;
  return { value: next, applied: true, needsReconciliation: false };
}

export function authoritativeRide(current: Ride | null, next: Ride) {
  const accepted = { ...next };
  if (!current) {
    applyLifecycleFlags(accepted);
    return accepted;
  }
  if (normalizeRealtimeVersion(next.realtime_version) < normalizeRealtimeVersion(current.realtime_version)) return current;
  if (isTerminalRide(current.status) && !isTerminalRide(next.status)) return current;
  applyLifecycleFlags(accepted);
  return accepted;
}

export function authoritativeRideRequest(current: RideRequest | null, next: RideRequest) {
  if (!current) return next;
  if (normalizeRealtimeVersion(next.realtime_version) < normalizeRealtimeVersion(current.realtime_version)) return current;
  if (TERMINAL_REQUESTS.has(current.status) && !TERMINAL_REQUESTS.has(next.status)) return current;
  return next;
}

export function sortDriverRides(rides: Ride[]) {
  return [...rides].sort((a, b) => String(b.departure_at || `${b.date}T${b.time}`).localeCompare(String(a.departure_at || `${a.date}T${a.time}`)));
}

export function sortRideRequests(requests: RideRequest[]) {
  return [...requests].sort((a, b) => String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || "")));
}

function isTerminalRide(status: unknown) {
  return TERMINAL_RIDES.has(String(status || ""));
}

function applyLifecycleFlags(ride: Ride) {
  const status = String(ride.status || "").toUpperCase();
  ride.can_start_trip = status === "BOARDING" || (status === "SCHEDULED" && Boolean(ride.can_start_trip));
  ride.can_end_trip = status === "IN_PROGRESS";
  ride.live_tracking_active = status === "IN_PROGRESS" && Boolean(ride.live_tracking_active);
  if (["COMPLETED", "CANCELLED", "EXPIRED"].includes(status)) ride.last_driver_location = null;
}
