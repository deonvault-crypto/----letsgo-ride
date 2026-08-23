import { API_BASE_URL } from "../constants/config";
import { ApiResponse } from "../types/api.types";
import { getToken, requestData } from "./api";
import { CourierDelivery } from "../types/courier.types";
import {
  CourierEarningsSummary,
  CourierProfile,
  CourierShift,
  CourierShiftBooking,
  WorkerApplication,
  WorkerApplicationDocumentType,
  WorkerProduct,
  WorkAvailability,
} from "../types/operations.types";

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

export function getActiveCourierDelivery() {
  return requestData<CourierDelivery | null>({ method: "GET", url: "/operations/courier/deliveries/active" });
}

export function listCourierDeliveryHistory() {
  return requestData<CourierDelivery[]>({ method: "GET", url: "/operations/courier/deliveries/history" });
}

export function getCourierEarnings() {
  return requestData<CourierEarningsSummary>({ method: "GET", url: "/operations/courier/earnings" });
}

export function listCourierOffers() {
  return requestData<CourierDelivery[]>({ method: "GET", url: "/operations/courier/offers" });
}

export function claimCourierOffer(deliveryId: string) {
  return requestData<CourierDelivery>({ method: "POST", url: `/operations/courier/offers/${deliveryId}/claim` });
}

export function listMyWorkerApplications() {
  return requestData<WorkerApplication[]>({ method: "GET", url: "/operations/applications/my" });
}

export function saveWorkerApplication(payload: {
  product: WorkerProduct;
  full_name: string;
  phone: string;
  service_area: string;
  vehicle?: string | null;
  experience?: string | null;
  business_name?: string | null;
  business_address?: string | null;
  business_registration_number?: string | null;
  accepted_terms: boolean;
}) {
  return requestData<WorkerApplication>({ method: "POST", url: "/operations/applications", data: payload });
}

export async function uploadWorkerApplicationDocument(data: {
  applicationId: string;
  documentType: WorkerApplicationDocumentType;
  uri: string;
  name: string;
  mimeType?: string | null;
}) {
  const formData = new FormData();
  formData.append("document_type", data.documentType);
  formData.append("file", {
    uri: data.uri,
    name: data.name,
    type: data.mimeType || (data.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg"),
  } as unknown as Blob);
  const token = await getToken();
  const response = await fetch(`${API_BASE_URL}/operations/applications/${encodeURIComponent(data.applicationId)}/documents`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData as unknown as BodyInit,
  });
  const payload = await response.json() as ApiResponse<WorkerApplication>;
  if (!response.ok || !payload.success) {
    throw new Error(payload.success === false ? payload.error : "Document upload failed.");
  }
  return payload.data;
}

export function submitWorkerApplication(applicationId: string) {
  return requestData<WorkerApplication>({ method: "POST", url: `/operations/applications/${applicationId}/submit` });
}

export function listAdminWorkerApplications() {
  return requestData<WorkerApplication[]>({ method: "GET", url: "/operations/admin/applications" });
}

export function reviewWorkerApplication(applicationId: string, status: "UNDER_REVIEW" | "APPROVED" | "REJECTED", note?: string | null) {
  return requestData<WorkerApplication>({ method: "POST", url: `/operations/admin/applications/${applicationId}/review`, data: { status, note: note || null } });
}

export function listAdminCourierShifts() {
  return requestData<CourierShift[]>({ method: "GET", url: "/operations/admin/courier/shifts" });
}

export function createAdminCourierShift(payload: {
  zone: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  booking_cutoff_minutes: number;
  incentive_usd?: number | null;
  active: boolean;
}) {
  return requestData<CourierShift>({ method: "POST", url: "/operations/admin/courier/shifts", data: payload });
}

export function updateAdminCourierShift(shiftId: string, payload: Partial<{
  zone: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  booking_cutoff_minutes: number;
  incentive_usd: number | null;
  active: boolean;
}>) {
  return requestData<CourierShift>({ method: "PATCH", url: `/operations/admin/courier/shifts/${shiftId}`, data: payload });
}

export function listAvailableCourierShifts() {
  return requestData<CourierShift[]>({ method: "GET", url: "/operations/courier/shifts/available" });
}

export function listMyCourierShifts() {
  return requestData<CourierShiftBooking[]>({ method: "GET", url: "/operations/courier/shifts/my" });
}

export function bookCourierShift(shiftId: string) {
  return requestData<CourierShiftBooking>({ method: "POST", url: `/operations/courier/shifts/${shiftId}/book` });
}

export function cancelCourierShift(bookingId: string) {
  return requestData<CourierShiftBooking>({ method: "POST", url: `/operations/courier/shift-bookings/${bookingId}/cancel` });
}
