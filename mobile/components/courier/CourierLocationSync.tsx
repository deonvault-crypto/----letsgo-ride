import { usePathname } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";

import { useCourierWorkspace } from "../../contexts/CourierWorkspaceContext";
import {
  startCourierBackgroundDeliveryTracking,
  stopCourierBackgroundDeliveryTracking,
} from "../../services/courierBackgroundLocation";
import { updateCourierLocation } from "../../services/courierService";
import {
  DeviceLocation,
  isReliableCourierLocation,
  watchForegroundLocation,
} from "../../services/locationService";

const ACTIVE_STATUSES = new Set(["ASSIGNED", "COURIER_TO_PICKUP", "PICKED_UP", "IN_TRANSIT", "ARRIVING"]);
type LocationSubscription = { remove: () => void };

export function CourierLocationSync() {
  const pathname = usePathname();
  const { active } = useCourierWorkspace();
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const watcher = useRef<LocationSubscription | null>(null);
  const generation = useRef(0);
  const writeInFlight = useRef(false);
  const lastAccepted = useRef<DeviceLocation | null>(null);

  const stopForeground = useCallback(() => {
    generation.current += 1;
    watcher.current?.remove();
    watcher.current = null;
    lastAccepted.current = null;
  }, []);

  const startForeground = useCallback(async (deliveryId: string) => {
    if (watcher.current || appState.current !== "active" || pathname.includes("/delivery/")) return;
    const watchGeneration = ++generation.current;
    const next = await watchForegroundLocation((location) => {
      if (watchGeneration !== generation.current || writeInFlight.current) return;
      if (!isReliableCourierLocation(location, lastAccepted.current)) return;
      lastAccepted.current = location;
      writeInFlight.current = true;
      void updateCourierLocation(deliveryId, {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        heading: location.heading,
        speed: location.speed,
        recorded_at: new Date(location.timestamp).toISOString(),
      }).catch(() => undefined).finally(() => { writeInFlight.current = false; });
    }, () => undefined, { timeInterval: 5000, distanceInterval: 10 });
    if (watchGeneration !== generation.current || appState.current !== "active" || pathname.includes("/delivery/")) {
      next.remove();
      return;
    }
    watcher.current = next;
  }, [pathname]);

  const reconcile = useCallback(async () => {
    if (!active?.id || !ACTIVE_STATUSES.has(active.status)) {
      stopForeground();
      await stopCourierBackgroundDeliveryTracking();
      return;
    }
    if (appState.current === "active") {
      await stopCourierBackgroundDeliveryTracking();
      if (pathname.includes("/delivery/")) stopForeground();
      else await startForeground(active.id);
      return;
    }
    stopForeground();
    await startCourierBackgroundDeliveryTracking(active.id);
  }, [active?.id, active?.status, pathname, startForeground, stopForeground]);

  useEffect(() => {
    void reconcile().catch(() => undefined);
  }, [reconcile]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      appState.current = next;
      void reconcile().catch(() => undefined);
    });
    return () => {
      subscription.remove();
      stopForeground();
      // Do not stop the OS task here: React can unmount because the app backgrounded.
    };
  }, [reconcile, stopForeground]);

  return null;
}
