import { usePathname } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";

import { useCourierWorkspace } from "../../contexts/CourierWorkspaceContext";
import {
  startCourierBackgroundDeliveryTracking,
  stopCourierBackgroundDeliveryTracking,
} from "../../services/courierBackgroundLocation";
import { updateCourierLocation } from "../../services/courierService";
import { updateCourierPresence } from "../../services/courierPresenceService";
import {
  DeviceLocation,
  isReliableCourierLocation,
  watchForegroundLocation,
} from "../../services/locationService";

const ACTIVE_STATUSES = new Set(["ASSIGNED", "COURIER_TO_PICKUP", "PICKED_UP", "IN_TRANSIT", "ARRIVING"]);
type LocationSubscription = { remove: () => void };

export function CourierLocationSync() {
  const pathname = usePathname();
  const { active, profile } = useCourierWorkspace();
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const watcher = useRef<LocationSubscription | null>(null);
  const generation = useRef(0);
  const writeInFlight = useRef(false);
  const lastAccepted = useRef<DeviceLocation | null>(null);
  const watcherMode = useRef<"delivery" | "presence" | null>(null);

  const stopForeground = useCallback(() => {
    generation.current += 1;
    watcher.current?.remove();
    watcher.current = null;
    watcherMode.current = null;
    lastAccepted.current = null;
  }, []);

  const startForeground = useCallback(async (mode: "delivery" | "presence", deliveryId?: string) => {
    if (watcher.current && watcherMode.current === mode) return;
    if (appState.current !== "active") return;
    if (mode === "delivery" && pathname.includes("/delivery/")) return;
    stopForeground();
    const watchGeneration = ++generation.current;
    const next = await watchForegroundLocation((location) => {
      if (watchGeneration !== generation.current || writeInFlight.current) return;
      if (!isReliableCourierLocation(location, lastAccepted.current)) return;
      lastAccepted.current = location;
      writeInFlight.current = true;
      const write = mode === "delivery" && deliveryId
        ? updateCourierLocation(deliveryId, {
            latitude: location.latitude,
            longitude: location.longitude,
            accuracy: location.accuracy,
            heading: location.heading,
            speed: location.speed,
            recorded_at: new Date(location.timestamp).toISOString(),
          })
        : updateCourierPresence(location);
      void write.catch(() => undefined).finally(() => { writeInFlight.current = false; });
    }, () => undefined, mode === "delivery"
      ? { timeInterval: 5000, distanceInterval: 10 }
      : { timeInterval: 30000, distanceInterval: 75 });
    if (watchGeneration !== generation.current || appState.current !== "active" || (mode === "delivery" && pathname.includes("/delivery/"))) {
      next.remove();
      return;
    }
    watcher.current = next;
    watcherMode.current = mode;
  }, [pathname, stopForeground]);

  const reconcile = useCallback(async () => {
    const hasActive = Boolean(active?.id && ACTIVE_STATUSES.has(active.status));
    if (!hasActive) {
      await stopCourierBackgroundDeliveryTracking();
      if (profile?.status === "APPROVED" && profile.online && appState.current === "active") {
        await startForeground("presence");
      } else {
        stopForeground();
      }
      return;
    }
    if (appState.current === "active") {
      await stopCourierBackgroundDeliveryTracking();
      if (pathname.includes("/delivery/")) stopForeground();
      else await startForeground("delivery", active!.id);
      return;
    }
    stopForeground();
    await startCourierBackgroundDeliveryTracking(active!.id);
  }, [active?.id, active?.status, pathname, profile?.online, profile?.status, startForeground, stopForeground]);

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
