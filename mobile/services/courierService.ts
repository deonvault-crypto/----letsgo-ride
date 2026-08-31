import { requestData } from "./api";
import { executeCriticalMutation } from "./criticalMutationOutbox";
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

const COURIER_STATUS_SUCCESS: Partial<Record<CourierStatus, string[]>> = {
  PICKED_UP: ["PICKED_UP", "IN_TRANSIT", "ARRIVING", "DELIVERED"],
  IN_TRANSIT: ["IN_TRANSIT", "ARRIVING", "DELIVERED"],
  ARRIVING: ["ARRIVING", "DELIVERED"],
};

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
  const url = `/courier/deliveries/${deliveryId}/status`;
  const data = { status, note: note || null };
  const execute = () => requestData<CourierDelivery>({ method: "POST", url, data });
  const successStatuses = COURIER_STATUS_SUCCESS[status];
  if (!successStatuses) return execute();
  return executeCriticalMutation(
    {
      dedupeKey: `courier-status:${deliveryId}`,
      url,
      data,
      checkUrl: `/courier/deliveries/${deliveryId}`,
      successStatuses,
    },
    execute,
  );
}

export function reportCourierDelay(deliveryId: string, note?: string) {
  return requestData<CourierDelivery>({
    method: "POST",
    url: `/courier/deliveries/${deliveryId}/delay`,
    data: { note: note || null },
  });
}

export function completeCourierDeliveryWithPin(deliveryId: string, pin: string) {
  const url = `/courier/deliveries/${deliveryId}/handoff`;
  const data = { pin };
  return executeCriticalMutation(
    {
      dedupeKey: `courier-handoff:${deliveryId}`,
      url,
      data,
      checkUrl: `/courier/deliveries/${deliveryId}`,
      successStatuses: ["DELIVERED"],
    },
    () => requestData<CourierDelivery>({ method: "POST", url, data }),
  );
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
