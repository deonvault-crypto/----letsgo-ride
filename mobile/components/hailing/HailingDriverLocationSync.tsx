import { useCallback, useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";

import { startDriverBackgroundTripTracking, stopDriverBackgroundTripTracking } from "../../services/hailingBackgroundLocation";
import {
  publishHailingDriverLocation,
  publishHailingDriverLocationError,
} from "../../services/hailingDriverLocationStore";
import { getHailingConfig, getHailingDriverStatus, updateHailingDriverPresence, updateHailingTripLocation } from "../../services/hailingService";
import { DeviceLocation, watchForegroundLocation } from "../../services/locationService";
import { ApiRequestError } from "../../services/api";
import type { HailingTripStatus } from "../../types/hailing.types";

const STATUS_REFRESH_MS = 8000;
const DISABLED_REFRESH_MS = 60000;
const ACTIVE_TRIP_STATUSES = new Set<HailingTripStatus>(["DRIVER_ASSIGNED", "DRIVER_EN_ROUTE", "DRIVER_ARRIVED", "PASSENGER_CONFIRMED_BOARDING", "IN_PROGRESS"]);

type TrackingTarget = { kind: "presence" | "trip"; tripId?: string };
type LocationSubscription = { remove: () => void };
function targetKey(target: TrackingTarget | null) { return target ? `${target.kind}:${target.tripId || "online"}` : "offline"; }
function locationPayload(location: DeviceLocation) { return { location: { latitude: location.latitude, longitude: location.longitude }, heading: location.heading ?? null, speed: location.speed ?? null, accuracy: location.accuracy ?? null }; }

export function HailingDriverLocationSync() {
  const subscription = useRef<LocationSubscription | null>(null);
  const activeTarget = useRef<TrackingTarget | null>(null);
  const backgroundTripId = useRef<string | null>(null);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const generation = useRef(0);
  const reconciliationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const featureEnabled = useRef<boolean | null>(null);
  const eligibilityBackoff = useRef(false);

  const stopForegroundWatch = useCallback(() => {
    generation.current += 1;
    subscription.current?.remove();
    subscription.current = null;
    activeTarget.current = null;
  }, []);

  const stopAllTracking = useCallback(() => {
    stopForegroundWatch();
    backgroundTripId.current = null;
    void stopDriverBackgroundTripTracking();
  }, [stopForegroundWatch]);

  const ensureBackgroundTrip = useCallback((tripId: string) => {
    if (backgroundTripId.current === tripId) return;
    backgroundTripId.current = tripId;
    void startDriverBackgroundTripTracking(tripId).then((started) => {
      if (!started && backgroundTripId.current === tripId) backgroundTripId.current = null;
    }).catch(() => { if (backgroundTripId.current === tripId) backgroundTripId.current = null; });
  }, []);

  const startLocationWatch = useCallback(async (target: TrackingTarget) => {
    const nextKey = targetKey(target);
    if (targetKey(activeTarget.current) === nextKey && subscription.current) return;
    stopForegroundWatch();
    activeTarget.current = target;
    const watchGeneration = generation.current;
    const activeTrip = target.kind === "trip";
    let sending = false;
    let pendingLocation: DeviceLocation | null = null;

    const send = async (location: DeviceLocation) => {
      if (!mounted.current || watchGeneration !== generation.current) return;
      publishHailingDriverLocation(location);
      if (sending) {
        pendingLocation = location;
        return;
      }
      sending = true;
      try {
        const payload = locationPayload(location);
        if (target.kind === "trip" && target.tripId) await updateHailingTripLocation(target.tripId, payload);
        else await updateHailingDriverPresence(payload);
      } catch (error) {
        if (mounted.current && watchGeneration === generation.current) {
          publishHailingDriverLocationError(error instanceof Error ? error : new Error("Unable to sync live driver location."));
        }
      } finally {
        sending = false;
        if (mounted.current && watchGeneration === generation.current && pendingLocation) {
          const next = pendingLocation;
          pendingLocation = null;
          void send(next);
        }
      }
    };

    try {
      const nextSubscription = await watchForegroundLocation(
        (location) => void send(location),
        (error) => publishHailingDriverLocationError(error),
        activeTrip ? { timeInterval: 4000, distanceInterval: 5 } : { timeInterval: 12000, distanceInterval: 35 },
      );
      if (!mounted.current || watchGeneration !== generation.current || appState.current !== "active") { nextSubscription.remove(); return; }
      subscription.current = nextSubscription;
    } catch (error) {
      if (watchGeneration === generation.current) {
        subscription.current = null;
        publishHailingDriverLocationError(error instanceof Error ? error : new Error("Live driver location could not start."));
      }
    }
  }, [stopForegroundWatch]);

  const reconcile = useCallback(async () => {
    try {
      if (featureEnabled.current !== true) {
        const config = await getHailingConfig();
        featureEnabled.current = config.enabled;
        if (!config.enabled) { stopAllTracking(); return; }
      }
      const status = await getHailingDriverStatus();
      eligibilityBackoff.current = false;
      if (!mounted.current) return;
      if (!status.online) { stopAllTracking(); return; }
      const activeTrip = status.active_trip;
      if (activeTrip && ACTIVE_TRIP_STATUSES.has(activeTrip.status)) {
        ensureBackgroundTrip(activeTrip.id);
        if (appState.current === "active") await startLocationWatch({ kind: "trip", tripId: activeTrip.id });
        else stopForegroundWatch();
      } else {
        if (backgroundTripId.current) { backgroundTripId.current = null; void stopDriverBackgroundTripTracking(); }
        if (appState.current === "active") await startLocationWatch({ kind: "presence" });
        else stopForegroundWatch();
      }
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 403) {
        eligibilityBackoff.current = true;
        stopAllTracking();
      }
      // Transient network/status failures leave an already-running background task alone.
    }
  }, [ensureBackgroundTrip, startLocationWatch, stopAllTracking, stopForegroundWatch]);

  useEffect(() => {
    mounted.current = true;
    const schedule = () => {
      if (reconciliationTimer.current) clearTimeout(reconciliationTimer.current);
      const delay = featureEnabled.current === false || eligibilityBackoff.current ? DISABLED_REFRESH_MS : STATUS_REFRESH_MS;
      reconciliationTimer.current = setTimeout(async () => { await reconcile(); if (mounted.current) schedule(); }, delay);
    };
    void reconcile().finally(schedule);
    const stateSubscription = AppState.addEventListener("change", (nextState) => {
      appState.current = nextState;
      if (nextState === "active") void reconcile();
      else stopForegroundWatch();
    });
    return () => {
      mounted.current = false;
      stateSubscription.remove();
      if (reconciliationTimer.current) clearTimeout(reconciliationTimer.current);
      reconciliationTimer.current = null;
      stopForegroundWatch();
      // Do not stop the OS background task just because the React tree unmounts while the app backgrounds.
    };
  }, [reconcile, stopForegroundWatch]);
  return null;
}
