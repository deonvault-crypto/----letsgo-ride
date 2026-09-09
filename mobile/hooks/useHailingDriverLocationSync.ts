import { useEffect, useRef } from "react";

import {
  subscribeHailingDriverLocation,
  subscribeHailingDriverLocationError,
} from "../services/hailingDriverLocationStore";
import type { DeviceLocation } from "../services/locationService";


type HailingDriverLocationSyncOptions = {
  enabled: boolean;
  tripId?: string | null;
  onLocation?: (location: DeviceLocation) => void;
  onError?: (error: Error) => void;
};

/**
 * Exposes the latest Ride Now driver position to map screens without creating
 * another GPS watcher. The driver layout owns the single authoritative watcher
 * and network publisher; screens only subscribe to its local location stream.
 */
export function useHailingDriverLocationSync({
  enabled,
  onLocation,
  onError,
}: HailingDriverLocationSyncOptions) {
  const onLocationRef = useRef(onLocation);
  const onErrorRef = useRef(onError);
  onLocationRef.current = onLocation;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!enabled) return undefined;

    const unsubscribeLocation = subscribeHailingDriverLocation((location) => {
      onLocationRef.current?.(location);
    });
    const unsubscribeError = subscribeHailingDriverLocationError((error) => {
      onErrorRef.current?.(error);
    });

    return () => {
      unsubscribeLocation();
      unsubscribeError();
    };
  }, [enabled]);
}
