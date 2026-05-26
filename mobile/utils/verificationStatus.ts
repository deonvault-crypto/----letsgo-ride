import { VerificationStatus } from "../types/verification.types";

export const approvedVerificationStatuses = new Set<string>(["verified", "approved", "active"]);
export const pendingVerificationStatuses = new Set<string>([
  "pending",
  "submitted",
  "under_review",
  "processing_biometrics",
]);
export const reviewVerificationStatuses = new Set<string>([
  "needs_review",
  "rejected",
  "flagged_for_review",
]);

export function isVerifiedStatus(status?: string | null) {
  return approvedVerificationStatuses.has(status || "");
}

export function isPendingVerificationStatus(status?: string | null) {
  return pendingVerificationStatuses.has(status || "");
}

export function needsVerificationReview(status?: string | null) {
  return reviewVerificationStatuses.has(status || "");
}

export function canStartVerification(status?: string | null) {
  return !status || status === "not_started" || needsVerificationReview(status);
}

export function toManualVerificationStatus(status: VerificationStatus) {
  if (status === "active") return "verified";
  if (status === "processing_biometrics") return "pending";
  if (status === "flagged_for_review") return "needs_review";
  return status;
}
