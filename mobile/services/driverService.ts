import { DriverProfile, VehicleInput } from "../types/driver.types";
import { requestData } from "./api";

export async function getDriverProfile() {
  return requestData<DriverProfile>({ method: "GET", url: "/drivers/me" });
}

export async function addVehicle(data: VehicleInput) {
  return requestData<VehicleInput>({ method: "POST", url: "/drivers/vehicle", data });
}
