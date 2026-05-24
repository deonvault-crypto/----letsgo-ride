export type RideStatus = "open" | "closed" | "cancelled" | "departed" | "completed";

export type Ride = {
  id: string;
  driver_id?: string;
  driver_user_id?: string;
  driver_name: string;
  driver_rating: number;
  driver_verification_status?: string;
  driver_profile_photo_url?: string | null;
  driver_avatar_url?: string | null;
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
  is_departed?: boolean;
  is_own_ride?: boolean;
  is_demo?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type RideRequest = {
  id: string;
  ride_id: string;
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
  ride_snapshot?: Ride;
  created_at?: string;
  updated_at?: string;
};

export type RideSearchParams = {
  origin?: string;
  destination?: string;
  date?: string;
  seats?: number;
};
