import { requestData } from "./api";
import {
  CourierCreatePayload,
  CourierDelivery,
  CourierDeliveryPin,
  CourierEvent,
  CourierLocation,
  CourierQuotePreview,
  CourierQuotePreviewPayload,
  CourierStatus,
  CourierTrackingState,
} from "../types/courier.types";

export function previewCourierQuote(payload: CourierQuotePreviewPayload) {
  return requestData<CourierQuotePreview>({
    method: "POST",
    url: "/courier/quote-preview",
    data: payload,
  });
}

export function createCourierDelivery(payload: CourierCreatePayload) {
  return requestData<CourierDelivery>({
    method: "POST",
    url: "/courier/deliveries",
    data: payload,
  });
}

export function listMyCourierDeliveries() {
  return requestData<CourierDelivery[]>({
    method: "GET",
    url: "/courier/deliveries/my",
  });
}

export function getCourierDelivery(deliveryId: string) {
  return requestData<CourierDelivery>({
    method: "GET",
    url: `/courier/deliveries/${deliveryId}`,
  });
}

export function getCourierEvents(deliveryId: string) {
  return requestData<CourierEvent[]>({
    method: "GET",
    url: `/courier/deliveries/${deliveryId}/events`,
  });
}

export function getCourierDeliveryPin(deliveryId: string) {
  return requestData<CourierDeliveryPin>({
    method: "GET",
    url: `/courier/deliveries/${deliveryId}/handoff-pin`,
  });
}

export function cancelCourierDelivery(deliveryId: string, reason?: string) {
  return requestData<CourierDelivery>({
    method: "POST",
    url: `/courier/deliveries/${deliveryId}/cancel`,
    data: { reason: reason || null },
  });
}

export function updateCourierDeliveryStatus(
  deliveryId: string,
  status: CourierStatus,
  note?: string,
) {
  return requestData<CourierDelivery>({
    method: "POST",
    url: `/courier/deliveries/${deliveryId}/status`,
    data: { status, note: note || null },
  });
}

export function reportCourierDelay(deliveryId: string, note?: string) {
  return requestData<CourierDelivery>({
    method: "POST",
    url: `/courier/deliveries/${deliveryId}/delay`,
    data: { note: note || null },
  });
}

export function completeCourierDeliveryWithPin(deliveryId: string, pin: string) {
  return requestData<CourierDelivery>({
    method: "POST",
    url: `/courier/deliveries/${deliveryId}/handoff`,
    data: { pin },
  });
}

export function getCourierTracking(deliveryId: string) {
  return requestData<CourierTrackingState>({
    method: "GET",
    url: `/courier/deliveries/${deliveryId}/tracking`,
  });
}

export function updateCourierLocation(deliveryId: string, location: CourierLocation) {
  return requestData<CourierDelivery>({
    method: "POST",
    url: `/courier/deliveries/${deliveryId}/location`,
    data: location,
  });
}
