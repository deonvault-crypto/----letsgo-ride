import { Ride, RideRequest } from "../types/ride.types";
import { User } from "../types/user.types";
import { VerificationProfile } from "../types/verification.types";

export const passengerUser: User = {
  id: "user-passenger",
  name: "Tendai Moyo",
  email: "tendai@example.com",
  phone: "+263771234567",
  city: "Harare",
  bio: "Regular intercity passenger",
  travel_preferences: "Window seat where possible",
  role: "passenger",
  rating: 0,
};

export const driverUser: User = {
  id: "user-driver",
  name: "Deon Ncube",
  email: "deon@example.com",
  phone: "+263772222222",
  city: "Bulawayo",
  role: "driver",
  rating: 0,
  profile_photo_url: "https://example.com/deon.jpg",
};

export const ride: Ride = {
  id: "ride-1",
  driver_id: "driver-1",
  driver_user_id: "user-driver",
  driver_name: "Deon Ncube",
  driver_rating: 4.9,
  driver_profile_photo_url: "https://example.com/deon.jpg",
  driver_review_count: 2,
  driver_completed_trips_count: 8,
  vehicle: "Example sedan, grey",
  origin: "Harare",
  destination: "Bulawayo",
  pickup_note: "Harare CBD",
  dropoff_note: "Bulawayo City Hall",
  date: "2026-06-03",
  time: "07:30",
  price_usd: 12,
  available_seats: 3,
  status: "open",
};

export const rideRequest: RideRequest = {
  id: "request-1",
  ride_id: "ride-1",
  passenger_name: "Tendai Moyo",
  passenger_phone: "+263771234567",
  passenger_note: "Small bag only",
  seats: 1,
  status: "pending",
  ride_snapshot: ride,
};

export const verifiedProfile: VerificationProfile = {
  driver_id: "driver-1",
  driver_status: "approved",
  verified: true,
  verification_status: "approved",
  verification_provider: "manual",
  documents: [],
  required_documents: ["identity_document", "driver_license", "selfie", "vehicle_registration_or_logbook", "vehicle_photo_optional"],
};

export const pendingProfile: VerificationProfile = {
  driver_id: "driver-1",
  driver_status: "pending_review",
  verified: false,
  verification_status: "pending_auto_check",
  verification_provider: "manual",
  documents: [],
  required_documents: ["identity_document", "driver_license", "selfie", "vehicle_registration_or_logbook", "vehicle_photo_optional"],
};

export const notStartedProfile: VerificationProfile = {
  driver_id: "driver-1",
  driver_status: "pending_review",
  verified: false,
  verification_status: "not_started",
  verification_provider: "manual",
  documents: [],
  required_documents: ["identity_document", "driver_license", "selfie", "vehicle_registration_or_logbook", "vehicle_photo_optional"],
};
