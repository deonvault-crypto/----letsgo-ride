export type CourierStatus =
  | "REQUESTED"
  | "MATCHING"
  | "ASSIGNED"
  | "COURIER_TO_PICKUP"
  | "PICKED_UP"
  | "IN_TRANSIT"
  | "ARRIVING"
  | "DELIVERED"
  | "CANCELLED"
  | "FAILED";

export type CourierGeoPoint = {
  latitude?: number | null;
  longitude?: number | null;
};

export type CourierCreatePayload = {
  pickup_address: string;
  dropoff_address: string;
  pickup_location?: CourierGeoPoint | null;
  dropoff_location?: CourierGeoPoint | null;
  recipient_name: string;
  recipient_phone: string;
  package_type: "parcel" | "shopping" | "documents" | "food" | "other";
  package_description?: string | null;
  weight_kg?: number | null;
  declared_value_usd?: number | null;
  pickup_note?: string | null;
  dropoff_note?: string | null;
};

export type CourierLocation = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  recorded_at?: string;
};

export type CourierDelivery = CourierCreatePayload & {
  id: string;
  sender_user_id: string;
  sender_name?: string;
  sender_phone?: string | null;
  courier_user_id?: string | null;
  courier_name?: string | null;
  status: CourierStatus;
  quote_status?: "PENDING" | "READY" | string;
  currency?: string;
  price_usd?: number | null;
  distance_km?: number | null;
  estimated_duration_minutes?: number | null;
  source_type?: "COURIER_REQUEST" | "FOOD_ORDER" | string;
  source_id?: string | null;
  food_order_id?: string | null;
  live_tracking_active?: boolean;
  last_courier_location?: CourierLocation | null;
  assigned_at?: string | null;
  picked_up_at?: string | null;
  delivered_at?: string | null;
  cancelled_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type CourierEvent = {
  id: string;
  delivery_id: string;
  type: string;
  actor_user_id?: string | null;
  data?: Record<string, unknown>;
  created_at: string;
};

export type CourierTrackingState = {
  delivery_id: string;
  status: CourierStatus;
  pickup_address?: string;
  dropoff_address?: string;
  courier_user_id?: string | null;
  courier_name?: string | null;
  live_tracking_active: boolean;
  last_courier_location?: CourierLocation | null;
  estimated_duration_minutes?: number | null;
  distance_km?: number | null;
};
