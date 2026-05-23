export type UserRole = "passenger" | "driver" | "admin";

export type User = {
  id: string;
  phone?: string;
  email?: string;
  name: string;
  city?: string;
  bio?: string;
  travel_preferences?: string;
  profile_photo_url?: string;
  profile_photo_name?: string;
  profile_photo_verified?: boolean;
  verification_status?: "not_started" | "pending" | "needs_review" | "verified" | "rejected";
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
