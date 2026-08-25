import { DriverWorkspaceSnapshot, LiveTripLocation, LiveTripState, Ride, RideRequest, RideSearchParams, RideStatus } from "../types/ride.types";
import { requestData } from "./api";

export async function listRides() {
  return requestData<Ride[]>({ method: "GET", url: "/rides" });
}

export async function myRides() {
  return requestData<Ride[]>({ method: "GET", url: "/rides/my" });
}

export async function getDriverWorkspace() {
  return requestData<DriverWorkspaceSnapshot>({ method: "GET", url: "/rides/driver/workspace" });
}

export async function searchRides(params: RideSearchParams) {
  return requestData<Ride[]>({
    method: "GET",
    url: "/rides/search",
    params: {
      origin: params.origin,
      destination: params.destination,
      date: params.date,
      seats: params.seats || 1,
    },
  });
}

export async function getRide(id: string) {
  return requestData<Ride>({ method: "GET", url: `/rides/${id}` });
}

export async function createRide(data: Partial<Ride>) {
  return requestData<Ride>({ method: "POST", url: "/rides", data });
}

export async function startTrip(id: string) {
  return requestData<Ride>({ method: "POST", url: `/rides/${id}/start` });
}

export async function endTrip(id: string) {
  return requestData<Ride>({ method: "POST", url: `/rides/${id}/end` });
}

export async function getLiveTripState(id: string) {
  return requestData<LiveTripState>({ method: "GET", url: `/rides/${id}/live` });
}

export async function updateLiveTripLocation(id: string, location: LiveTripLocation) {
  return requestData<{ ride_id: string; realtime_version: number; status: RideStatus; location: LiveTripLocation; last_driver_location: LiveTripLocation; live_tracking_enabled: boolean }>({
    method: "POST",
    url: `/rides/${id}/live-location`,
    data: location,
  });
}

export async function disableLiveTripLocation(id: string) {
  return requestData<Ride>({ method: "POST", url: `/rides/${id}/live-location/disable` });
}

export async function requestSeat(data: {
  ride_id: string;
  passenger_name?: string;
  passenger_phone?: string;
  passenger_note?: string;
  seats?: number;
}) {
  return requestData<RideRequest>({ method: "POST", url: "/requests", data });
}

export async function myRideRequests() {
  return requestData<RideRequest[]>({ method: "GET", url: "/requests/my" });
}

export async function driverRideRequests() {
  return requestData<RideRequest[]>({ method: "GET", url: "/requests/driver" });
}

export async function updateRideRequest(id: string, status: RideRequest["status"]) {
  return requestData<RideRequest>({
    method: "PATCH",
    url: `/requests/${id}`,
    data: { status },
  });
}

export async function acceptRideRequest(id: string) {
  return requestData<RideRequest>({ method: "POST", url: `/requests/${id}/accept` });
}

export async function declineRideRequest(id: string, reason?: string) {
  return requestData<RideRequest>({
    method: "POST",
    url: `/requests/${id}/decline`,
    data: { status: "declined", reason },
  });
}

export async function cancelMyRideRequest(id: string, reason?: string) {
  return requestData<RideRequest>({
    method: "POST",
    url: `/requests/${id}/cancel`,
    data: { status: "cancelled_by_passenger", reason },
  });
}

export async function cancelPassengerRideRequest(id: string, reason: string) {
  return requestData<RideRequest>({
    method: "POST",
    url: `/requests/${id}/cancel-passenger`,
    data: { status: "cancelled_by_driver", reason },
  });
}

export async function checkInRideRequest(id: string) {
  return requestData<RideRequest>({ method: "POST", url: `/requests/${id}/check-in` });
}
