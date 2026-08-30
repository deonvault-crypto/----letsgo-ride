import { requestData } from "./api";
import {
  HailingConfig,
  HailingCoordinate,
  HailingDispatchOffer,
  HailingDriverStatus,
  HailingPaymentMethod,
  HailingPlace,
  HailingQuote,
  HailingRideClass,
  HailingServiceArea,
  HailingServiceAreaResolution,
  HailingStripeIntent,
  HailingTrip,
  HailingTripShare,
  PaymentConfig,
} from "../types/hailing.types";
import type { Conversation } from "../types/conversation.types";

export function getHailingConfig() {
  return requestData<HailingConfig>({ method: "GET", url: "/hailing/config" });
}

export function getPaymentConfig() {
  return requestData<PaymentConfig>({ method: "GET", url: "/payments/config" });
}

export function resolveHailingServiceArea(location: HailingCoordinate) {
  return requestData<HailingServiceAreaResolution>({ method: "POST", url: "/hailing/service-area/resolve", data: location });
}

export function createHailingQuote(data: { pickup: HailingPlace; dropoff: HailingPlace; ride_class: HailingRideClass }) {
  return requestData<HailingQuote>({ method: "POST", url: "/hailing/quotes", data });
}

export function createHailingStripePaymentIntent(data: { quote_id: string; client_request_id: string }) {
  return requestData<HailingStripeIntent>({ method: "POST", url: "/payments/hailing/stripe/intent", data });
}

export function requestHailingTrip(data: {
  quote_id: string;
  payment_method?: HailingPaymentMethod;
  client_request_id?: string;
  verify_ride_with_pin?: boolean;
  stripe_payment_intent_id?: string;
}) {
  const url = data.payment_method === "card" ? "/payments/hailing/stripe/trips" : "/hailing/trips";
  return requestData<HailingTrip>({ method: "POST", url, data });
}

export function getActiveHailingTrip() {
  return requestData<HailingTrip | null>({ method: "GET", url: "/hailing/trips/active" });
}

export function getHailingTrip(id: string) {
  return requestData<HailingTrip>({ method: "GET", url: `/hailing/trips/${encodeURIComponent(id)}` });
}

export function shareHailingTrip(id: string) {
  return requestData<HailingTripShare>({ method: "POST", url: `/hailing/trips/${encodeURIComponent(id)}/share` });
}

export function cancelHailingTrip(id: string, reason?: string) {
  return requestData<HailingTrip>({ method: "POST", url: `/hailing/trips/${encodeURIComponent(id)}/cancel`, data: { reason: reason || undefined } });
}

export function getHailingDriverStatus() {
  return requestData<HailingDriverStatus>({ method: "GET", url: "/hailing/driver/status" });
}

export function goHailingDriverOnline(data: { city_id: string; ride_class: HailingRideClass; location: HailingCoordinate }) {
  return requestData<HailingDriverStatus["presence"]>({ method: "POST", url: "/hailing/driver/online", data });
}

export function goHailingDriverOffline() {
  return requestData<{ status: "offline" }>({ method: "POST", url: "/hailing/driver/offline" });
}

export function updateHailingDriverPresence(data: { location: HailingCoordinate; heading?: number | null; speed?: number | null; accuracy?: number | null }) {
  return requestData<HailingDriverStatus["presence"]>({ method: "POST", url: "/hailing/driver/presence", data });
}

export function updateHailingTripLocation(id: string, data: { location: HailingCoordinate; heading?: number | null; speed?: number | null; accuracy?: number | null }) {
  return requestData<HailingTrip>({ method: "POST", url: `/hailing/trips/${encodeURIComponent(id)}/location`, data });
}

type DriverOfferEnvelope = { offer: Omit<HailingDispatchOffer, "trip">; trip: HailingTrip };

export async function getHailingDriverOffer(): Promise<HailingDispatchOffer | null> {
  const envelope = await requestData<DriverOfferEnvelope | null>({ method: "GET", url: "/hailing/driver/offer" });
  if (!envelope) return null;
  return { ...envelope.offer, trip: envelope.trip };
}

export function acceptHailingOffer(id: string) {
  return requestData<HailingTrip>({ method: "POST", url: `/hailing/offers/${encodeURIComponent(id)}/accept` });
}

export function declineHailingOffer(id: string, reason?: string) {
  return requestData<HailingDispatchOffer>({ method: "POST", url: `/hailing/offers/${encodeURIComponent(id)}/decline`, data: { reason: reason || undefined } });
}

export function markHailingDriverArrived(id: string) {
  return requestData<HailingTrip>({ method: "POST", url: `/hailing/trips/${encodeURIComponent(id)}/arrived` });
}

export function confirmHailingBoarding(id: string) {
  return requestData<HailingTrip>({ method: "POST", url: `/hailing/trips/${encodeURIComponent(id)}/confirm-boarding` });
}

export function verifyHailingTripPin(id: string, pin: string) {
  return requestData<HailingTrip>({ method: "POST", url: `/hailing/trips/${encodeURIComponent(id)}/verify-pin`, data: { pin } });
}

export function regenerateHailingTripPin(id: string) {
  return requestData<HailingTrip>({ method: "POST", url: `/hailing/trips/${encodeURIComponent(id)}/regenerate-pin` });
}

export function startHailingTrip(id: string) {
  return requestData<HailingTrip>({ method: "POST", url: `/hailing/trips/${encodeURIComponent(id)}/start` });
}

export function completeHailingTrip(id: string) {
  return requestData<HailingTrip>({ method: "POST", url: `/hailing/trips/${encodeURIComponent(id)}/complete` });
}

export function sendHailingSafetyEvent(id: string, data: { kind?: string; message: string }) {
  return requestData<{ recorded: boolean }>({ method: "POST", url: `/hailing/trips/${encodeURIComponent(id)}/safety-event`, data });
}

export function openHailingConversation(id: string) {
  return requestData<Conversation>({ method: "POST", url: `/hailing/trips/${encodeURIComponent(id)}/conversation` });
}

export type AdminHailingDriver = {
  id: string;
  user_id?: string;
  name?: string;
  city?: string;
  verified: boolean;
  verification_status?: string;
  status?: string;
  hailing_enabled: boolean;
  approved_hailing_city_ids: string[];
  approved_hailing_classes: HailingRideClass[];
  current_presence?: { status?: string; city_id?: string; ride_class?: HailingRideClass; last_seen_at?: string } | null;
};

export function listAdminHailingCities() {
  return requestData<HailingServiceArea[]>({ method: "GET", url: "/admin/hailing/cities" });
}

export function listAdminHailingDrivers() {
  return requestData<AdminHailingDriver[]>({ method: "GET", url: "/admin/hailing/drivers" });
}

export function updateAdminHailingDriverEligibility(driverId: string, data: { hailing_enabled: boolean; approved_hailing_city_ids: string[]; approved_hailing_classes: HailingRideClass[] }) {
  return requestData<AdminHailingDriver>({ method: "PATCH", url: `/admin/hailing/drivers/${encodeURIComponent(driverId)}/eligibility`, data });
}

export function listAdminHailingTrips() {
  return requestData<HailingTrip[]>({ method: "GET", url: "/admin/hailing/trips" });
}
