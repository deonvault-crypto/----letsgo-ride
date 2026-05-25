import { Ride, RideStatus } from "../types/ride.types";

export const activeTripStatuses: RideStatus[] = ["BOARDING", "IN_PROGRESS", "departed"];
export const finalTripStatuses: RideStatus[] = ["COMPLETED", "CANCELLED", "EXPIRED", "completed", "cancelled", "closed"];

export function canonicalRideStatus(status?: RideStatus | string): RideStatus {
  const normalized = String(status || "SCHEDULED").toUpperCase();
  if (normalized === "OPEN") return "SCHEDULED";
  if (normalized === "CLOSED") return "COMPLETED";
  if (normalized === "DEPARTED") return "IN_PROGRESS";
  if (normalized === "CANCELLED") return "CANCELLED";
  return normalized as RideStatus;
}

export function isTripActive(ride?: Ride | null) {
  return canonicalRideStatus(ride?.status) === "IN_PROGRESS";
}

export function isTripFinal(ride?: Ride | null) {
  return finalTripStatuses.includes(canonicalRideStatus(ride?.status));
}

export function isRideBookable(ride?: Ride | null) {
  if (!ride) return false;
  if (typeof ride.is_bookable === "boolean") return ride.is_bookable;
  return canonicalRideStatus(ride.status) === "SCHEDULED" && !ride.is_departed && Number(ride.available_seats || 0) > 0;
}

export function tripStatusLabel(status?: RideStatus | string) {
  const canonical = canonicalRideStatus(status);
  if (canonical === "SCHEDULED") return "Scheduled";
  if (canonical === "BOARDING") return "Boarding";
  if (canonical === "IN_PROGRESS") return "In Progress";
  if (canonical === "COMPLETED") return "Completed";
  if (canonical === "CANCELLED") return "Cancelled";
  if (canonical === "EXPIRED") return "Expired";
  if (canonical === "DRAFT") return "Draft";
  return String(status || "Scheduled");
}

export function tripStatusTone(status?: RideStatus | string): "success" | "warning" | "danger" | "neutral" {
  const canonical = canonicalRideStatus(status);
  if (canonical === "SCHEDULED") return "success";
  if (canonical === "BOARDING" || canonical === "IN_PROGRESS") return "warning";
  if (canonical === "CANCELLED" || canonical === "EXPIRED") return "danger";
  return "neutral";
}

export function departureCountdown(ride?: Ride | null) {
  if (!ride?.departure_at) return "";
  const departure = new Date(ride.departure_at);
  const diffMs = departure.getTime() - Date.now();
  if (Number.isNaN(departure.getTime())) return "";
  if (diffMs <= 0) return "Departure time reached";
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 60) return `Departs in ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `Departs in ${hours}h ${rest}m` : `Departs in ${hours}h`;
}
