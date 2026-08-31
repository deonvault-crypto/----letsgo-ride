import { useEffect, useRef, useState } from "react";

import { computeRoute } from "../services/routingService";
import type { HailingCoordinate, HailingRoute } from "../types/hailing.types";

const MIN_REROUTE_INTERVAL_MS = 15_000;
const MOVEMENT_REROUTE_METERS = 75;

function distanceMeters(a: HailingCoordinate, b: HailingCoordinate) {
  const radius = 6_371_000;
  const radians = Math.PI / 180;
  const lat1 = a.latitude * radians;
  const lat2 = b.latitude * radians;
  const dLat = (b.latitude - a.latitude) * radians;
  const dLon = (b.longitude - a.longitude) * radians;
  const value = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(Math.max(0, 1 - value)));
}

export type LiveDriverNavigation = {
  route: HailingRoute | null;
  distanceKm: number | null;
  etaMinutes: number | null;
  refreshing: boolean;
};

/**
 * Builds a fresh road route from the Driver's live position to the current trip
 * target. Reroutes are movement-aware and throttled so GPS updates do not create
 * an API request storm. A temporary routing failure preserves the last good route.
 */
export function useLiveDriverNavigationRoute({
  enabled,
  currentLocation,
  target,
  targetKey,
}: {
  enabled: boolean;
  currentLocation: HailingCoordinate | null;
  target: HailingCoordinate | null;
  targetKey: string;
}): LiveDriverNavigation {
  const [route, setRoute] = useState<HailingRoute | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const lastOriginRef = useRef<HailingCoordinate | null>(null);
  const lastTargetKeyRef = useRef<string | null>(null);
  const lastRequestedAtRef = useRef(0);
  const inFlightRef = useRef(false);
  const pendingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!enabled || !currentLocation || !target) return;

    const targetChanged = lastTargetKeyRef.current !== targetKey;
    const moved = lastOriginRef.current
      ? distanceMeters(lastOriginRef.current, currentLocation)
      : Number.POSITIVE_INFINITY;
    const dueByMovement = moved >= MOVEMENT_REROUTE_METERS;
    const enoughTimePassed = Date.now() - lastRequestedAtRef.current >= MIN_REROUTE_INTERVAL_MS;

    if (!targetChanged && (!dueByMovement || !enoughTimePassed)) return;
    if (inFlightRef.current) {
      pendingRef.current = targetChanged || dueByMovement;
      return;
    }

    let cancelled = false;
    const run = async () => {
      inFlightRef.current = true;
      pendingRef.current = false;
      lastRequestedAtRef.current = Date.now();
      if (mountedRef.current) setRefreshing(true);
      try {
        const next = await computeRoute(currentLocation, target, true);
        if (cancelled || !mountedRef.current) return;
        lastOriginRef.current = currentLocation;
        lastTargetKeyRef.current = targetKey;
        setRoute({
          distance_km: next.distance_km,
          duration_seconds: next.duration_seconds,
          duration_minutes: next.estimated_duration_minutes,
          estimated_duration_minutes: next.estimated_duration_minutes,
          encoded_polyline: next.encoded_polyline,
        });
      } catch {
        // Keep the last good route. External navigation and the original trip route
        // remain available if the routing provider is temporarily unreachable.
      } finally {
        inFlightRef.current = false;
        if (mountedRef.current) setRefreshing(false);
      }
    };

    void run();
    return () => { cancelled = true; };
  }, [currentLocation, enabled, target, targetKey]);

  // When the target changes while a request is in flight, the next GPS update will
  // retrigger immediately because lastTargetKeyRef still points at the old target.
  const distanceKm = route?.distance_km ?? null;
  const etaMinutes = route?.estimated_duration_minutes ?? route?.duration_minutes ?? null;

  return { route, distanceKm, etaMinutes, refreshing };
}
