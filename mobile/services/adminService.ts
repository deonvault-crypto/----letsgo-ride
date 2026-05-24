import { API_BASE_URL } from "../constants/config";
import { Ride, RideRequest } from "../types/ride.types";
import { User } from "../types/user.types";
import { getToken, requestData } from "./api";
import {
  AdminVerificationDetail,
  AdminVerificationListItem,
  VerificationDocumentStatus,
  VerificationStatus,
} from "../types/verification.types";

export type AdminOverview = {
  users: number;
  rides: number;
  requests: number;
  pending_verifications: number;
  support_messages: number;
  safety_reports: number;
};

export type AdminSupportMessage = {
  id: string;
  subject: string;
  message: string;
  status: string;
  user_name?: string;
  user_email?: string;
  user_phone?: string;
  created_at?: string;
};

export type AdminSafetyReport = {
  id: string;
  report_type: string;
  message: string;
  status: string;
  user_name?: string;
  user_email?: string;
  user_phone?: string;
  created_at?: string;
};

export async function getAdminOverview() {
  return requestData<AdminOverview>({ method: "GET", url: "/admin/overview" });
}

export async function listAdminUsers() {
  return requestData<User[]>({ method: "GET", url: "/admin/users" });
}

export async function updateAdminUserStatus(userId: string, status: "active" | "suspended") {
  return requestData<User>({
    method: "PATCH",
    url: `/admin/users/${userId}/status`,
    params: { status },
  });
}

export async function listAdminRides() {
  return requestData<Ride[]>({ method: "GET", url: "/admin/rides" });
}

export async function updateAdminRideStatus(rideId: string, status: "open" | "closed" | "cancelled") {
  return requestData<Ride>({
    method: "PATCH",
    url: `/admin/rides/${rideId}/status`,
    data: { status },
  });
}

export async function listAdminRequests() {
  return requestData<RideRequest[]>({ method: "GET", url: "/admin/requests" });
}

export async function updateAdminRequestStatus(requestId: string, status: RideRequest["status"]) {
  return requestData<RideRequest>({
    method: "PATCH",
    url: `/admin/requests/${requestId}/status`,
    data: { status },
  });
}

export async function listAdminSupportMessages() {
  return requestData<AdminSupportMessage[]>({ method: "GET", url: "/admin/support/messages" });
}

export async function updateAdminSupportStatus(messageId: string, status: "received" | "in_review" | "resolved") {
  return requestData<AdminSupportMessage>({
    method: "PATCH",
    url: `/admin/support/messages/${messageId}/status`,
    params: { status },
  });
}

export async function listAdminReports() {
  return requestData<AdminSafetyReport[]>({ method: "GET", url: "/admin/reports" });
}

export async function updateAdminReportStatus(reportId: string, status: "submitted" | "in_review" | "resolved") {
  return requestData<AdminSafetyReport>({
    method: "PATCH",
    url: `/admin/reports/${reportId}/status`,
    params: { status },
  });
}

export async function listAdminVerifications(status?: VerificationStatus) {
  return requestData<{ count: number; items: AdminVerificationListItem[] }>({
    method: "GET",
    url: "/admin/verifications",
    params: status ? { status } : undefined,
  });
}

export async function getAdminVerification(driverId: string) {
  return requestData<AdminVerificationDetail>({
    method: "GET",
    url: `/admin/verifications/${driverId}`,
  });
}

export async function updateAdminVerificationStatus(data: {
  driverId: string;
  status: Extract<VerificationStatus, "needs_review" | "verified" | "rejected">;
  admin_verification_notes?: string;
  rejection_reason?: string;
  document_id?: string;
  document_status?: VerificationDocumentStatus;
}) {
  const { driverId, ...payload } = data;
  return requestData<Record<string, unknown>>({
    method: "PATCH",
    url: `/admin/verifications/${driverId}/status`,
    data: payload,
  });
}

export async function getAdminDocumentUrl(driverId: string, documentId: string) {
  const token = await getToken();
  const query = token ? `?access_token=${encodeURIComponent(token)}` : "";
  return `${API_BASE_URL}/admin/verifications/${encodeURIComponent(driverId)}/documents/${encodeURIComponent(documentId)}${query}`;
}
