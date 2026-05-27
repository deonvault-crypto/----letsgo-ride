export const approvedVerificationStatuses = new Set<string>(["approved"]);
export const pendingVerificationStatuses = new Set<string>([
  "pending_uploads",
  "pending_auto_check",
  "needs_resubmission",
]);
export const reviewVerificationStatuses = new Set<string>([
  "needs_review",
  "rejected",
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
