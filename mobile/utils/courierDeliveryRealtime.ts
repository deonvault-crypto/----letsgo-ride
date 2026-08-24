import type { CourierDelivery, CourierEvent, CourierStatus } from "../types/courier.types";
import type { RealtimeEventEnvelope } from "../types/realtime.types";


const TERMINAL = new Set<CourierStatus>(["DELIVERED", "CANCELLED", "FAILED"]);
const DELIVERY_EVENT_TYPES = new Set([
  "courier_delivery.updated",
  "courier_delivery.location_updated",
  "courier_delivery.status_changed",
  "courier_delivery.route_updated",
  "courier_delivery.terminal",
]);
const SAFE_FIELDS: Array<keyof CourierDelivery> = [
  "status",
  "quote_status",
  "courier_user_id",
  "courier_name",
  "price_usd",
  "distance_km",
  "estimated_duration_minutes",
  "route_polyline",
  "live_tracking_active",
  "last_courier_location",
  "remaining_distance_km",
  "remaining_eta_minutes",
  "remaining_route_polyline",
  "remaining_route_updated_at",
  "cancelled_at",
  "delivered_at",
];

export type CourierDeliveryEventResult = {
  delivery: CourierDelivery;
  journeyEvent: CourierEvent | null;
  applied: boolean;
  needsReconciliation: boolean;
};

export function applyCourierDeliveryEvent(
  current: CourierDelivery,
  event: RealtimeEventEnvelope,
): CourierDeliveryEventResult {
  const ignored = { delivery: current, journeyEvent: null, applied: false, needsReconciliation: false };
  if (
    event.resource_type !== "courier_delivery"
    || event.resource_id !== current.id
    || !DELIVERY_EVENT_TYPES.has(event.type)
  ) return ignored;

  const currentVersion = normalizeVersion(current.realtime_version);
  if (event.version <= currentVersion) return ignored;
  if (event.version > currentVersion + 1) {
    return { ...ignored, needsReconciliation: true };
  }
  if (normalizeVersion(event.payload.realtime_version) !== event.version) {
    return { ...ignored, needsReconciliation: true };
  }

  const incomingStatus = event.payload.status;
  if (TERMINAL.has(current.status) && typeof incomingStatus === "string" && !TERMINAL.has(incomingStatus as CourierStatus)) {
    return { ...ignored, needsReconciliation: true };
  }

  const delivery = { ...current, realtime_version: event.version } as CourierDelivery;
  for (const field of SAFE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(event.payload, field)) {
      Object.assign(delivery, { [field]: event.payload[field] });
    }
  }
  if (TERMINAL.has(delivery.status)) delivery.live_tracking_active = false;

  return {
    delivery,
    journeyEvent: parseJourneyEvent(event.payload.journey_event, current.id),
    applied: true,
    needsReconciliation: false,
  };
}

export function authoritativeDelivery(current: CourierDelivery | null, next: CourierDelivery) {
  if (!current) return next;
  const currentVersion = normalizeVersion(current.realtime_version);
  const nextVersion = normalizeVersion(next.realtime_version);
  if (nextVersion < currentVersion) return current;
  if (TERMINAL.has(current.status) && !TERMINAL.has(next.status)) return current;
  return TERMINAL.has(next.status) ? { ...next, live_tracking_active: false } : next;
}

function parseJourneyEvent(value: unknown, deliveryId: string): CourierEvent | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || typeof item.type !== "string" || typeof item.created_at !== "string") return null;
  return {
    id: item.id,
    delivery_id: deliveryId,
    type: item.type,
    created_at: item.created_at,
  };
}

function normalizeVersion(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}
