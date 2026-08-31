import { requestData } from "./api";
import type { DeviceLocation } from "./locationService";
import type { CourierProfile } from "../types/operations.types";


export function updateCourierPresence(location: DeviceLocation) {
  return requestData<CourierProfile>({
    method: "POST",
    url: "/operations/courier/presence",
    data: {
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy,
      heading: location.heading,
      speed: location.speed,
      recorded_at: new Date(location.timestamp).toISOString(),
    },
  });
}
