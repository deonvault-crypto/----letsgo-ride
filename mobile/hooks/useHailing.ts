import { useCallback, useEffect, useRef, useState } from "react";

import {
  getActiveHailingTrip,
  getHailingConfig,
  getHailingDriverOffer,
  getHailingDriverStatus,
} from "../services/hailingService";
import {
  HailingConfig,
  HailingDispatchOffer,
  HailingDriverStatus,
  HailingTrip,
} from "../types/hailing.types";
import { useScreenReconciliation } from "./useScreenReconciliation";

const ACTIVE_REFRESH_MS = 4500;
const TERMINAL_STATUSES = new Set([
  "COMPLETED",
  "CANCELLED_BY_PASSENGER",
  "CANCELLED_BY_DRIVER",
  "CANCELLED_BY_ADMIN",
  "NO_DRIVER_FOUND",
]);

export function useHailingConfig() {
  const [config, setConfig] = useState<HailingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const requestGeneration = ++generation.current;
    try {
      const next = await getHailingConfig();
      if (generation.current !== requestGeneration) return;
      setConfig(next);
      setError(null);
    } catch (err) {
      if (generation.current === requestGeneration) {
        setError(err instanceof Error ? err.message : "Ride Now is unavailable.");
      }
    } finally {
      if (generation.current === requestGeneration) setLoading(false);
    }
  }, []);

  useScreenReconciliation(load);

  return { config, loading, error, reload: load };
}

export function useActiveHailingTrip(autoRefresh = true) {
  const [trip, setTrip] = useState<HailingTrip | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const load = useCallback(async () => {
    const requestGeneration = ++generation.current;
    setRefreshing(true);
    try {
      const next = await getActiveHailingTrip();
      if (generation.current !== requestGeneration) return;
      setTrip(next);
      setError(null);
    } catch (err) {
      if (generation.current === requestGeneration) {
        setError(err instanceof Error ? err.message : "Unable to refresh your Ride Now trip.");
      }
    } finally {
      if (generation.current === requestGeneration) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useScreenReconciliation(load);

  useEffect(() => {
    clearTimer();
    if (!autoRefresh || !trip || TERMINAL_STATUSES.has(trip.status)) return undefined;
    timer.current = setTimeout(load, ACTIVE_REFRESH_MS);
    return clearTimer;
  }, [autoRefresh, clearTimer, load, trip?.id, trip?.status]);

  useEffect(() => clearTimer, [clearTimer]);

  return { trip, loading, refreshing, error, reload: load, setTrip };
}

export function useHailingDriverWorkspace(autoRefresh = true) {
  const [status, setStatus] = useState<HailingDriverStatus | null>(null);
  const [offer, setOffer] = useState<HailingDispatchOffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const load = useCallback(async () => {
    const requestGeneration = ++generation.current;
    setRefreshing(true);
    try {
      const [nextStatus, nextOffer] = await Promise.all([
        getHailingDriverStatus(),
        getHailingDriverOffer().catch(() => null),
      ]);
      if (generation.current !== requestGeneration) return;
      setStatus(nextStatus);
      setOffer(nextOffer);
      setError(null);
    } catch (err) {
      if (generation.current === requestGeneration) {
        setError(err instanceof Error ? err.message : "Unable to refresh Ride Now driver status.");
      }
    } finally {
      if (generation.current === requestGeneration) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useScreenReconciliation(load);

  useEffect(() => {
    clearTimer();
    const active = status?.active_trip && !TERMINAL_STATUSES.has(status.active_trip.status);
    const waiting = status?.presence?.status === "available" || status?.presence?.status === "offered";
    if (!autoRefresh || (!active && !offer && !waiting)) return undefined;
    timer.current = setTimeout(load, ACTIVE_REFRESH_MS);
    return clearTimer;
  }, [autoRefresh, clearTimer, load, offer?.id, status?.active_trip?.id, status?.active_trip?.status, status?.presence?.status]);

  useEffect(() => clearTimer, [clearTimer]);

  return { status, offer, loading, refreshing, error, reload: load, setStatus, setOffer };
}
