import * as Location from "expo-location";

export type DeviceLocation = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  timestamp: number;
};

export function isReliableCourierLocation(next: DeviceLocation, previous?: DeviceLocation | null) {
  if (!Number.isFinite(next.latitude) || !Number.isFinite(next.longitude)) return false;
  if (next.latitude < -90 || next.latitude > 90 || next.longitude < -180 || next.longitude > 180) return false;
  if (typeof next.accuracy === "number" && next.accuracy > 100) return false;
  if (!previous) return true;

  const elapsedSeconds = Math.max(0.001, (next.timestamp - previous.timestamp) / 1000);
  const movedMeters = distanceMeters(previous, next);
  if (movedMeters < 3 && elapsedSeconds < 8) return false;

  const impliedSpeed = movedMeters / elapsedSeconds;
  const reportedSpeed = typeof next.speed === "number" ? next.speed : 0;
  return impliedSpeed <= 55 || reportedSpeed >= impliedSpeed * 0.65;
}

function distanceMeters(a: Pick<DeviceLocation, "latitude" | "longitude">, b: Pick<DeviceLocation, "latitude" | "longitude">) {
  const radians = (value: number) => value * Math.PI / 180;
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const dLat = radians(b.latitude - a.latitude);
  const dLng = radians(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function normalizeLocation(location: Location.LocationObject): DeviceLocation {
  const available = (value: number | null) => typeof value === "number" && value >= 0 ? value : null;
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracy: available(location.coords.accuracy),
    heading: available(location.coords.heading),
    speed: available(location.coords.speed),
    timestamp: location.timestamp,
  };
}

export async function ensureForegroundLocationPermission() {
  const existing = await Location.getForegroundPermissionsAsync();
  if (existing.granted) return true;

  const requested = await Location.requestForegroundPermissionsAsync();
  return requested.granted;
}

export async function getCurrentDeviceLocation(): Promise<DeviceLocation> {
  const granted = await ensureForegroundLocationPermission();
  if (!granted) {
    throw new Error("Allow location access to use your current position. You can still search or move the map instead.");
  }

  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });
  return normalizeLocation(location);
}

export async function watchForegroundLocation(
  onLocation: (location: DeviceLocation) => void,
  onError?: (error: Error) => void,
) {
  const granted = await ensureForegroundLocationPermission();
  if (!granted) {
    const error = new Error("Location permission is required to share live delivery progress.");
    onError?.(error);
    throw error;
  }

  return Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.High,
      distanceInterval: 25,
      timeInterval: 10000,
    },
    (location) => {
      try {
        onLocation(normalizeLocation(location));
      } catch (error) {
        onError?.(error instanceof Error ? error : new Error("Unable to process location update."));
      }
    },
  );
}
