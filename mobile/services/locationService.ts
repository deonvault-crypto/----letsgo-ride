import * as Location from "expo-location";

export type DeviceLocation = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  timestamp: number;
};

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
    throw new Error("Location permission is required to use live map features.");
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
