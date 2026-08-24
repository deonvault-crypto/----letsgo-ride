import type { CourierOffer } from "../types/courier.types";
import type { RealtimeEventEnvelope } from "../types/realtime.types";


const OFFER_EVENTS = new Set([
  "courier_offer.available",
  "courier_offer.updated",
  "courier_offer.removed",
]);

export type CourierOfferEventResult = {
  offers: CourierOffer[];
  versions: Map<string, number>;
  applied: boolean;
  needsReconciliation: boolean;
};

export function applyCourierOfferEvent(
  current: CourierOffer[],
  currentVersions: Map<string, number>,
  event: RealtimeEventEnvelope,
): CourierOfferEventResult {
  const ignored = { offers: current, versions: currentVersions, applied: false, needsReconciliation: false };
  if (event.resource_type !== "courier_offer" || !OFFER_EVENTS.has(event.type)) return ignored;
  const knownVersion = currentVersions.get(event.resource_id);
  if (knownVersion != null && event.version <= knownVersion) return ignored;

  const versions = new Map(currentVersions);
  versions.set(event.resource_id, event.version);
  if (event.type === "courier_offer.removed") {
    return {
      offers: current.filter((offer) => offer.id !== event.resource_id),
      versions,
      applied: true,
      needsReconciliation: false,
    };
  }
  if (knownVersion != null && event.version > knownVersion + 1) {
    return { ...ignored, needsReconciliation: true };
  }
  const offer = parseCourierOffer(event);
  if (!offer) return { ...ignored, needsReconciliation: true };
  const index = current.findIndex((item) => item.id === offer.id);
  const offers = index >= 0
    ? current.map((item, itemIndex) => itemIndex === index ? offer : item)
    : [...current, offer];
  return { offers: sortCourierOffers(offers), versions, applied: true, needsReconciliation: false };
}

export function versionsForOffers(offers: CourierOffer[]) {
  return new Map(offers.map((offer) => [offer.id, Number(offer.realtime_version || 0)]));
}

export function sortCourierOffers(offers: CourierOffer[]) {
  return [...offers].sort((left, right) => String(left.created_at || "").localeCompare(String(right.created_at || "")));
}

export function selectedCourierOfferId(offers: CourierOffer[], current: string | null) {
  return current && offers.some((offer) => offer.id === current) ? current : offers[0]?.id || null;
}

function parseCourierOffer(event: RealtimeEventEnvelope): CourierOffer | null {
  const payload = event.payload;
  if (
    payload.id !== event.resource_id
    || payload.status !== "MATCHING"
    || payload.quote_status !== "READY"
    || typeof payload.pickup_address !== "string"
    || typeof payload.dropoff_address !== "string"
    || typeof payload.price_usd !== "number"
    || payload.price_usd <= 0
    || typeof payload.courier_payout_usd !== "number"
    || payload.courier_payout_usd <= 0
  ) return null;
  return {
    id: event.resource_id,
    realtime_version: event.version,
    source_type: typeof payload.source_type === "string" ? payload.source_type : "COURIER_REQUEST",
    status: "MATCHING",
    quote_status: "READY",
    pickup_address: payload.pickup_address,
    dropoff_address: payload.dropoff_address,
    pickup_location: isPoint(payload.pickup_location) ? payload.pickup_location : null,
    dropoff_location: isPoint(payload.dropoff_location) ? payload.dropoff_location : null,
    currency: typeof payload.currency === "string" ? payload.currency : "USD",
    price_usd: payload.price_usd,
    courier_payout_usd: payload.courier_payout_usd,
    distance_km: typeof payload.distance_km === "number" ? payload.distance_km : null,
    estimated_duration_minutes: typeof payload.estimated_duration_minutes === "number" ? payload.estimated_duration_minutes : null,
    route_polyline: typeof payload.route_polyline === "string" ? payload.route_polyline : null,
    created_at: typeof payload.created_at === "string" ? payload.created_at : undefined,
    updated_at: typeof payload.updated_at === "string" ? payload.updated_at : undefined,
  };
}

function isPoint(value: unknown): value is { latitude?: number | null; longitude?: number | null } {
  if (!value || typeof value !== "object") return false;
  const point = value as Record<string, unknown>;
  return typeof point.latitude === "number" && typeof point.longitude === "number";
}
