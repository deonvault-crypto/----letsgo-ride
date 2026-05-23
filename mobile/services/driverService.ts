import { DriverProfile, VehicleInput } from "../types/driver.types";
import { requestData } from "./api";

export async function getDriverProfile() {
  return requestData<DriverProfile>({ method: "GET", url: "/drivers/me" });
}

export async function applyAsDriver(data: {
  name: string;
  phone: string;
  city: string;
  vehicle?: string;
  experience?: string;
}) {
  return requestData<DriverProfile>({ method: "POST", url: "/drivers/apply", data });
}

export async function addVehicle(data: VehicleInput) {
  return requestData<VehicleInput>({ method: "POST", url: "/drivers/vehicle", data });
}
