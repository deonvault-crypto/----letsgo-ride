import type { DeviceLocation } from "./locationService";

type LocationListener = (location: DeviceLocation) => void;
type ErrorListener = (error: Error) => void;

let latestLocation: DeviceLocation | null = null;
const locationListeners = new Set<LocationListener>();
const errorListeners = new Set<ErrorListener>();

export function publishHailingDriverLocation(location: DeviceLocation) {
  latestLocation = location;
  for (const listener of locationListeners) listener(location);
}

export function publishHailingDriverLocationError(error: Error) {
  for (const listener of errorListeners) listener(error);
}

export function subscribeHailingDriverLocation(listener: LocationListener) {
  locationListeners.add(listener);
  if (latestLocation) listener(latestLocation);
  return () => locationListeners.delete(listener);
}

export function subscribeHailingDriverLocationError(listener: ErrorListener) {
  errorListeners.add(listener);
  return () => errorListeners.delete(listener);
}
