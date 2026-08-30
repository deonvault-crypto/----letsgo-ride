import { useEffect, useRef } from "react";

import { updateHailingDriverPresence, updateHailingTripLocation } from "../services/hailingService";
import { DeviceLocation, watchForegroundLocation } from "../services/locationService";


type HailingDriverLocationSyncOptions = {
  enabled: boolean;
  tripId?: string | null;
  onLocation?: (location: DeviceLocation) => void;
  onError?: (error: Error) => void;
};

/**
 * Keeps the authoritative Ride Now driver position fresh while the app is active.
 * The watcher is intentionally single-flight: if GPS produces another point while
 * a request is in flight, only the newest point is retained and sent next.
 */
export function useHailingDriverLocationSync({
  enabled,
  tripId,
  onLocation,
  onError,
}: HailingDriverLocationSyncOptions) {
  const onLocationRef = useRef(onLocation);
  const onErrorRef = useRef(onError);
  onLocationRef.current = onLocation;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!enabled) return undefined;

    let active = true;
    let subscription: { remove: () => void } | null = null;
    let sending = false;
    let pending: DeviceLocation | null = null;

    const send = async (location: DeviceLocation) => {
      if (!active) return;
      onLocationRef.current?.(location);
      if (sending) {
        pending = location;
        return;
      }
      sending = true;
      try {
        const payload = {
          location: { latitude: location.latitude, longitude: location.longitude },
          heading: location.heading,
          speed: location.speed,
          accuracy: location.accuracy,
        };
        if (tripId) await updateHailingTripLocation(tripId, payload);
        else await updateHailingDriverPresence(payload);
      } catch (error) {
        if (active) onErrorRef.current?.(error instanceof Error ? error : new Error("Unable to sync live driver location."));
      } finally {
        sending = false;
        if (active && pending) {
          const next = pending;
          pending = null;
          void send(next);
        }
      }
    };

    void watchForegroundLocation(
      (location) => void send(location),
      (error) => onErrorRef.current?.(error),
      { timeInterval: 4000, distanceInterval: 5 },
    ).then((next) => {
      if (!active) next.remove();
      else subscription = next;
    }).catch((error) => {
      if (active) onErrorRef.current?.(error instanceof Error ? error : new Error("Live driver location could not start."));
    });

    return () => {
      active = false;
      pending = null;
      subscription?.remove();
    };
  }, [enabled, tripId]);
}
