export type RideStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "BOARDING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "EXPIRED"
  | "open"
  | "closed"
  | "cancelled"
  | "departed"
  | "completed";

export type LiveTripLocation = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  updated_at?: string;
};

export type Ride = {
  id: string;
  driver_id?: string;
  driver_user_id?: string;
  driver_name: string;
  driver_rating: number;
  driver_verification_status?: string;
  driver_profile_photo_url?: string | null;
  driver_avatar_url?: string | null;
  driver_review_count?: number;
  driver_completed_trips_count?: number;
  vehicle: string;
  origin: string;
  destination: string;
  pickup_note: string;
  dropoff_note: string;
  date: string;
  time: string;
  price_usd: number;
  available_seats: number;
  status: RideStatus;
  legacy_status?: string;
  departure_at?: string | null;
  boarding_starts_at?: string | null;
  estimated_arrival_at?: string | null;
  auto_complete_at?: string | null;
  estimated_duration_minutes?: number;
  can_start_trip?: boolean;
  can_end_trip?: boolean;
  is_bookable?: boolean;
  live_tracking_active?: boolean;
  last_driver_location?: LiveTripLocation | null;
  is_departed?: boolean;
  is_own_ride?: boolean;
  is_demo?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type RideRequest = {
  id: string;
  ride_id: string;
  user_id?: string;
  passenger_name: string;
  passenger_phone?: string;
  passenger_profile_photo_url?: string;
  passenger_verification_status?: string;
  passenger_note?: string;
  seats: number;
  status: "pending" | "confirmed" | "declined" | "cancelled" | "cancelled_by_passenger" | "cancelled_by_driver" | "cancelled_by_admin";
  driver_decision_reason?: string;
  cancellation_reason?: string;
  driver_cancellation_reason?: string;
  admin_cancellation_reason?: string;
  checked_in?: boolean;
  checked_in_at?: string;
  ride_snapshot?: Ride;
  created_at?: string;
  updated_at?: string;
};

export type LiveTripState = {
  ride_id: string;
  status: RideStatus;
  departure_at?: string | null;
  estimated_arrival_at?: string | null;
  auto_complete_at?: string | null;
  live_tracking_enabled: boolean;
  last_driver_location?: LiveTripLocation | null;
  origin?: string;
  destination?: string;
};

export type RideSearchParams = {
  origin?: string;
  destination?: string;
  date?: string;
  seats?: number;
};
