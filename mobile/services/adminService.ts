import { API_BASE_URL } from "../constants/config";
import { Ride, RideRequest } from "../types/ride.types";
import { User } from "../types/user.types";
import { requestData } from "./api";
import {
  AdminVerificationDetail,
  AdminVerificationListItem,
  VerificationDocumentStatus,
  VerificationStatus,
} from "../types/verification.types";

export type AdminOverview = {
  users: number;
  total_users: number;
  verified_drivers: number;
  pending_driver_verifications: number;
  rides: number;
  active_rides: number;
  requests: number;
  pending_ride_requests: number;
  confirmed_bookings: number;
  pending_verifications: number;
  support_messages: number;
  open_support_cases: number;
  safety_reports: number;
  open_safety_reports: number;
  unread_admin_notifications: number;
  recent_activity: AdminActivity[];
};

export type AdminActivity = {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  status?: string;
  tone?: "success" | "warning" | "danger" | "neutral";
  target_type: string;
  target_id: string;
  created_at?: string;
};

export type AdminListResponse<T> = {
  count: number;
  items: T[];
};

export type AdminProfilePhotoReviewItem = {
  user_id: string;
  name?: string;
  email?: string;
  role: "driver" | "courier";
  city?: string;
  candidate_url: string;
  current_approved_url?: string | null;
  profile_photo_verified: boolean;
  review_status: "pending" | "approved" | "rejected";
  rejection_reason?: string | null;
  submitted_at?: string | null;
  is_replacement: boolean;
};

export type AdminUser = User & {
  status?: string;
  posted_rides_count?: number;
  ride_requests_count?: number;
  confirmed_bookings_count?: number;
  support_cases_count?: number;
  safety_reports_count?: number;
  driver_verification_status?: string;
  driver_status?: string;
};

export type AdminRide = Ride & {
  request_count?: number;
  pending_request_count?: number;
  confirmed_booking_count?: number;
  cancelled_request_count?: number;
  conversation_count?: number;
  driver_email?: string;
  driver_phone?: string;
  driver_city?: string;
  driver_account_status?: string;
  driver_identity_status?: string;
};

export type AdminRequest = RideRequest & {
  driver_name?: string;
  driver_email?: string;
  driver_phone?: string;
  passenger_email?: string;
  passenger_city?: string;
  conversation_count?: number;
  ride?: AdminRide;
};

export type AdminSupportMessage = {
  id: string;
  subject?: string;
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

export type AdminAuditLog = {
  id: string;
  actor_user_id?: string;
  actor_role?: string;
  action: string;
  target_type: string;
  target_id: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
};

export async function getAdminOverview() {
  return requestData<AdminOverview>({ method: "GET", url: "/admin/overview" });
}

export async function listAdminUsers(params?: {
  search?: string;
  role?: string;
  status?: string;
  verification?: string;
}) {
  return requestData<AdminListResponse<AdminUser>>({ method: "GET", url: "/admin/users", params });
}

export async function updateAdminUserStatus(userId: string, status: "active" | "suspended", reason?: string) {
  return requestData<AdminUser>({
    method: "PATCH",
    url: `/admin/users/${userId}/status`,
    params: { status, reason },
  });
}

export async function listAdminRides(params?: {
  search?: string;
  status?: string;
  filter?: string;
}) {
  return requestData<AdminListResponse<AdminRide>>({ method: "GET", url: "/admin/rides", params });
}

export async function updateAdminRideStatus(rideId: string, status: "open" | "closed" | "cancelled", reason?: string) {
  return requestData<AdminRide>({
    method: "PATCH",
    url: `/admin/rides/${rideId}/status`,
    params: { reason },
    data: { status },
  });
}

export async function listAdminRequests(params?: { search?: string; status?: string }) {
  return requestData<AdminListResponse<AdminRequest>>({ method: "GET", url: "/admin/requests", params });
}

export async function updateAdminRequestStatus(requestId: string, status: Extract<RideRequest["status"], "cancelled_by_admin">, reason: string) {
  return requestData<AdminRequest>({
    method: "PATCH",
    url: `/admin/requests/${requestId}/status`,
    data: { status, reason },
  });
}

export async function listAdminSupportMessages(params?: { search?: string; status?: string }) {
  return requestData<AdminListResponse<AdminSupportMessage>>({ method: "GET", url: "/admin/support/messages", params });
}

export async function updateAdminSupportStatus(messageId: string, status: "received" | "open" | "in_review" | "resolved" | "closed", admin_notes?: string) {
  return requestData<AdminSupportMessage>({
    method: "PATCH",
    url: `/admin/support/messages/${messageId}/status`,
    params: { status, admin_notes },
  });
}

export async function listAdminReports(params?: { search?: string; status?: string }) {
  return requestData<AdminListResponse<AdminSafetyReport>>({ method: "GET", url: "/admin/reports", params });
}

export async function updateAdminReportStatus(reportId: string, status: "submitted" | "open" | "in_review" | "resolved" | "dismissed", admin_notes?: string) {
  return requestData<AdminSafetyReport>({
    method: "PATCH",
    url: `/admin/reports/${reportId}/status`,
    params: { status, admin_notes },
  });
}

export async function listAdminAuditLogs(params?: { action?: string; target_type?: string }) {
  return requestData<AdminListResponse<AdminAuditLog>>({
    method: "GET",
    url: "/admin/audit-logs",
    params,
  });
}

export async function listAdminProfilePhotos(status: "pending" | "approved" | "rejected" = "pending") {
  return requestData<AdminListResponse<AdminProfilePhotoReviewItem>>({
    method: "GET",
    url: "/admin/profile-photos",
    params: { status },
  });
}

export async function updateAdminProfilePhotoStatus(userId: string, status: "approved" | "rejected", reason?: string) {
  return requestData<{
    user_id: string;
    role: "driver" | "courier";
    profile_photo_url?: string | null;
    profile_photo_verified: boolean;
    review_status: "approved" | "rejected";
    rejection_reason?: string | null;
  }>({
    method: "PATCH",
    url: `/admin/profile-photos/${userId}`,
    data: { status, reason },
  });
}

export async function listAdminVerifications(status?: VerificationStatus, search?: string) {
  return requestData<{ count: number; items: AdminVerificationListItem[] }>({
    method: "GET",
    url: "/admin/verifications",
    params: { status, search },
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
  status: Extract<VerificationStatus, "needs_review" | "approved" | "rejected" | "needs_resubmission">;
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
  const result = await requestData<{ url: string }>({
    method: "POST",
    url: `/admin/verifications/${encodeURIComponent(driverId)}/documents/${encodeURIComponent(documentId)}/access`,
  });
  return `${API_BASE_URL}${result.url}`;
}


export type AdminDriverSettlement = {
  id: string;
  driver_user_id: string;
  driver_id: string;
  driver_name: string;
  driver_email?: string | null;
  period_start: string;
  period_end: string;
  ride_count: number;
  gross_fares_usd: number;
  amount_due_usd: number;
  status: "due" | "overdue" | "paid";
  due_at?: string | null;
  paid_at?: string | null;
};

export type AdminDriverSettlementDashboard = {
  summary: { outstanding_usd: number; collected_usd: number; overdue_count: number; statement_count: number };
  items: AdminDriverSettlement[];
};

export async function getAdminDriverSettlements() {
  return requestData<AdminDriverSettlementDashboard>({ method: "GET", url: "/admin/finance/driver-settlements" });
}
