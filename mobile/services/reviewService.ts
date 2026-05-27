import { DriverPublicProfile, PendingReview, ReviewCreateInput, ReviewSummary } from "../types/review.types";
import { requestData } from "./api";

export async function getDriverPublicProfile(driverId: string) {
  return requestData<DriverPublicProfile>({ method: "GET", url: `/drivers/${driverId}` });
}

export async function listPendingReviews() {
  return requestData<PendingReview[]>({ method: "GET", url: "/reviews/pending" });
}

export async function createReview(data: ReviewCreateInput) {
  return requestData({ method: "POST", url: "/reviews", data });
}

export async function getPublicReviews(userId: string) {
  return requestData<ReviewSummary>({ method: "GET", url: `/reviews/user/${userId}` });
}
