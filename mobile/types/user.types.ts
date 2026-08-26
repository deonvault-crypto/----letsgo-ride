export type UserRole = "passenger" | "driver" | "courier" | "merchant" | "admin";

export type User = {
  id: string;
  phone?: string;
  email?: string;
  pending_email?: string | null;
  name: string;
  city?: string;
  bio?: string;
  travel_preferences?: string;
  profile_photo_url?: string;
  profile_photo_name?: string;
  profile_photo_verified?: boolean;
  verification_status?: "not_started" | "pending" | "pending_uploads" | "pending_auto_check" | "needs_review" | "needs_resubmission" | "verified" | "approved" | "rejected" | "active";
  email_verified?: boolean;
  notification_trip_updates?: boolean;
  notification_booking_requests?: boolean;
  notification_support_replies?: boolean;
  notification_safety_alerts?: boolean;
  notification_marketing?: boolean;
  role: UserRole;
  rating?: number;
  token?: string;
};
