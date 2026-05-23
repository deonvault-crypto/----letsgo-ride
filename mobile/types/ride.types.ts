export type RideStatus = "open" | "closed" | "cancelled";

export type Ride = {
  id: string;
  driver_id?: string;
  driver_name: string;
  driver_rating: number;
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
  is_demo?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type RideRequest = {
  id: string;
  ride_id: string;
  passenger_name: string;
  passenger_phone?: string;
  passenger_note?: string;
  seats: number;
  status: "pending" | "confirmed" | "declined" | "cancelled";
  ride_snapshot?: Ride;
  created_at?: string;
  updated_at?: string;
};

export type RideSearchParams = {
  origin?: string;
  destination?: string;
  seats?: number;
};
