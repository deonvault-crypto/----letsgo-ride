import { requestData } from "./api";
import {
  AdminVerificationDetail,
  AdminVerificationListItem,
  VerificationDocumentStatus,
  VerificationStatus,
} from "../types/verification.types";

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
