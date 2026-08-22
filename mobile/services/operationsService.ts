import { requestData } from "./api";
import { CourierDelivery } from "../types/courier.types";
import { CourierProfile, WorkAvailability } from "../types/operations.types";

export function listWorkAvailability() {
  return requestData<WorkAvailability[]>({ method: "GET", url: "/operations/availability" });
}

export function createWorkAvailability(payload: {
  mode: "ride" | "courier";
  date: string;
  start_time: string;
  end_time: string;
  note?: string | null;
}) {
  return requestData<WorkAvailability>({ method: "POST", url: "/operations/availability", data: payload });
}

export function deleteWorkAvailability(itemId: string) {
  return requestData<{ deleted: boolean }>({ method: "DELETE", url: `/operations/availability/${itemId}` });
}

export function getCourierProfile() {
  return requestData<CourierProfile | null>({ method: "GET", url: "/operations/courier/profile" });
}

export function createCourierProfile(payload: {
  transport_mode: "bicycle" | "motorbike" | "car" | "van";
  vehicle_description?: string | null;
}) {
  return requestData<CourierProfile>({ method: "POST", url: "/operations/courier/profile", data: payload });
}

export function setCourierOnline(online: boolean) {
  return requestData<CourierProfile>({ method: "POST", url: "/operations/courier/online", data: { online } });
}

export function listAssignedCourierDeliveries() {
  return requestData<CourierDelivery[]>({ method: "GET", url: "/operations/courier/deliveries" });
}

export function listCourierOffers() {
  return requestData<CourierDelivery[]>({ method: "GET", url: "/operations/courier/offers" });
}

export function claimCourierOffer(deliveryId: string) {
  return requestData<CourierDelivery>({ method: "POST", url: `/operations/courier/offers/${deliveryId}/claim` });
}
