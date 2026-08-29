export type HailingRideClass = "ECONOMY" | "COMFORT" | "XL";

export type HailingTripStatus =
  | "SEARCHING"
  | "DRIVER_ASSIGNED"
  | "DRIVER_EN_ROUTE"
  | "DRIVER_ARRIVED"
  | "PASSENGER_CONFIRMED_BOARDING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED_BY_PASSENGER"
  | "CANCELLED_BY_DRIVER"
  | "CANCELLED_BY_ADMIN"
  | "NO_DRIVER_FOUND";

export type HailingCoordinate = {
  latitude: number;
  longitude: number;
};

export type HailingPlace = {
  formatted_address: string;
  latitude: number;
  longitude: number;
  place_id?: string | null;
  service_area_id?: string | null;
};

export type HailingRideClassConfig = {
  id: HailingRideClass;
  label: string;
  enabled: boolean;
  base_fare?: number;
  per_km?: number;
  per_minute?: number;
  minimum_fare?: number;
  booking_fee?: number;
  surge_multiplier?: number;
};

export type HailingConfig = {
  enabled: boolean;
  currency: string;
  ride_classes: HailingRideClassConfig[];
  cash_enabled: boolean;
  digital_payments: string[];
};

export type HailingServiceArea = {
  id: string;
  name: string;
  slug: string;
  province: string;
  country: string;
  country_code: "ZW";
  center: HailingCoordinate;
  service_radius_km: number;
  timezone: string;
  currency: string;
  enabled: boolean;
  ride_hailing_enabled: boolean;
  pickup_enabled: boolean;
  dropoff_enabled: boolean;
  ride_classes: Array<HailingRideClassConfig | HailingRideClass>;
  pricing?: Record<string, Record<string, number | boolean>>;
  dispatch?: Record<string, number | number[]>;
};

export type HailingServiceAreaResolution = {
  supported: boolean;
  enabled: boolean;
  reason?: string | null;
  service_area: HailingServiceArea | null;
  ride_classes: Array<HailingRideClassConfig | HailingRideClass>;
};

export type HailingRoute = {
  distance_km: number;
  duration_minutes?: number;
  estimated_duration_minutes?: number;
  duration_seconds?: number;
  polyline?: string | null;
  encoded_polyline?: string | null;
};

export type HailingFare = {
  currency?: string;
  ride_class?: HailingRideClass;
  base_fare: number;
  distance_fare: number;
  time_fare: number;
  booking_fee: number;
  minimum_fare?: number;
  surge_multiplier: number;
  total_fare: number;
  estimated_driver_earnings: number;
  platform_commission?: number;
  platform_commission_percent?: number;
  high_demand?: boolean;
};

export type HailingQuote = {
  quote_id: string;
  city_id?: string;
  currency: string;
  ride_class: HailingRideClass;
  pickup: HailingPlace;
  dropoff: HailingPlace;
  city?: HailingServiceArea | null;
  route: HailingRoute & { duration_minutes: number };
  fare: HailingFare;
  expires_at: string;
};

export type HailingParticipantSnapshot = {
  id?: string;
  user_id?: string;
  name?: string;
  phone?: string | null;
  rating?: number | null;
  vehicle?: string | null;
  plate?: string | null;
  profile_photo_url?: string | null;
};

export type HailingVehicleSnapshot = HailingParticipantSnapshot & {
  vehicle_id?: string | null;
  make?: string | null;
  model?: string | null;
  color?: string | null;
  plate_number?: string | null;
};

export type HailingTrip = {
  id: string;
  status: HailingTripStatus;
  city_id: string;
  passenger_user_id?: string;
  driver_user_id?: string | null;
  ride_class: HailingRideClass;
  payment_method: "cash";
  payment_status: "pending" | "cash_due" | "cash_collected" | "paid" | "failed" | "refunded";
  verify_ride_with_pin?: boolean;
  trip_pin_verified_at?: string | null;
  pickup: HailingPlace;
  dropoff: HailingPlace;
  route: HailingRoute;
  fare: HailingFare;
  driver?: HailingParticipantSnapshot | null;
  passenger?: HailingParticipantSnapshot | null;
  vehicle?: HailingVehicleSnapshot | null;
  trip_pin?: string | null;
  search_expires_at?: string | null;
  created_at: string;
  updated_at: string;
  assigned_at?: string | null;
  arrived_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
};

export type HailingDriverStatus = {
  driver_id?: string;
  online: boolean;
  presence: {
    status: "offline" | "available" | "offered" | "en_route" | "arrived" | "on_trip";
    city_id?: string | null;
    ride_class?: HailingRideClass | null;
    last_seen_at?: string | null;
  } | null;
  active_trip: HailingTrip | null;
  offer?: HailingDispatchOffer | null;
  stats: {
    rides_today: number;
    gross_fares: number;
    platform_commission: number;
    estimated_net: number;
    online_minutes: number;
  };
};

export type HailingDispatchOffer = {
  id: string;
  trip_id: string;
  status: "pending" | "accepted" | "declined" | "expired" | "cancelled";
  expires_at: string;
  trip: HailingTrip;
};
