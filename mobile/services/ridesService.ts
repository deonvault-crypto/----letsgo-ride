import { Ride, RideRequest, RideSearchParams } from "../types/ride.types";
import { requestData } from "./api";

export async function listRides() {
  return requestData<Ride[]>({ method: "GET", url: "/rides" });
}

export async function searchRides(params: RideSearchParams) {
  return requestData<Ride[]>({
    method: "GET",
    url: "/rides/search",
    params: {
      origin: params.origin,
      destination: params.destination,
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
