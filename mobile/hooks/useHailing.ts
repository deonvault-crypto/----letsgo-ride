import { useCallback, useEffect, useRef, useState } from "react";

import { useRealtime } from "../contexts/RealtimeContext";
import {
  getActiveHailingTrip,
  getHailingConfig,
  getHailingDriverOffer,
  getHailingDriverStatus,
  getHailingTrip,
} from "../services/hailingService";
import {
  HailingConfig,
  HailingDispatchOffer,
  HailingDriverStatus,
  HailingTrip,
} from "../types/hailing.types";
import { useScreenReconciliation } from "./useScreenReconciliation";

const RECOVERY_REFRESH_MS = 6500;
const CONNECTED_RECONCILIATION_MS = 15000;
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
      if (generation.current === requestGeneration) setError(err instanceof Error ? err.message : "Ride Now is unavailable.");
    } finally {
      if (generation.current === requestGeneration) setLoading(false);
    }
  }, []);

  useScreenReconciliation(load);
  return { config, loading, error, reload: load };
}

export function useActiveHailingTrip(autoRefresh = true) {
  const { connectionState, reconciliationRevision, subscribe } = useRealtime();
  const [trip, setTrip] = useState<HailingTrip | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenRevision = useRef(reconciliationRevision);

  const clearTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const load = useCallback(() => {
    if (inFlight.current) return inFlight.current;
    const requestGeneration = ++generation.current;
    setRefreshing(true);
    let request!: Promise<void>;
    request = getActiveHailingTrip()
      .then((next) => {
        if (generation.current !== requestGeneration) return;
        setTrip(next);
        setError(null);
      })
      .catch((err) => {
        if (generation.current === requestGeneration) setError(err instanceof Error ? err.message : "Unable to refresh your Ride Now trip.");
      })
      .finally(() => {
        if (generation.current === requestGeneration) {
          setLoading(false);
          setRefreshing(false);
        }
        if (inFlight.current === request) inFlight.current = null;
      });
    inFlight.current = request;
    return request;
  }, []);

  useScreenReconciliation(load);

  useEffect(() => subscribe((event) => {
    if (event.resource_type !== "hailing_trip") return;
    void load();
  }), [load, subscribe]);

  useEffect(() => {
    if (seenRevision.current === reconciliationRevision) return;
    seenRevision.current = reconciliationRevision;
    void load();
  }, [load, reconciliationRevision]);

  useEffect(() => {
    clearTimer();
    if (!autoRefresh || !trip || TERMINAL_STATUSES.has(trip.status)) return undefined;
    let cancelled = false;
    const schedule = () => {
      const delay = connectionState === "connected" ? CONNECTED_RECONCILIATION_MS : RECOVERY_REFRESH_MS;
      timer.current = setTimeout(async () => {
        await load();
        if (!cancelled) schedule();
      }, delay);
    };
    schedule();
    return () => {
      cancelled = true;
      clearTimer();
    };
  }, [autoRefresh, clearTimer, connectionState, load, trip?.id, trip?.status]);

  useEffect(() => clearTimer, [clearTimer]);
  return { trip, loading, refreshing, error, reload: load, setTrip, realtimeState: connectionState };
}

export function useHailingTripRealtime(tripId: string, enabled = true) {
  const { connectionState, reconciliationRevision, subscribe } = useRealtime();
  const [trip, setTrip] = useState<HailingTrip | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const seenRevision = useRef(reconciliationRevision);

  const clearTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const load = useCallback(() => {
    if (!enabled || !tripId) return Promise.resolve();
    if (inFlight.current) return inFlight.current;
    setRefreshing(true);
    let request!: Promise<void>;
    request = getHailingTrip(tripId)
      .then((next) => {
        setTrip(next);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to refresh this Ride Now trip."))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
        if (inFlight.current === request) inFlight.current = null;
      });
    inFlight.current = request;
    return request;
  }, [enabled, tripId]);

  useScreenReconciliation(load, enabled);

  useEffect(() => subscribe((event) => {
    if (!enabled || event.resource_type !== "hailing_trip" || event.resource_id !== tripId) return;
    void load();
  }), [enabled, load, subscribe, tripId]);

  useEffect(() => {
    if (seenRevision.current === reconciliationRevision) return;
    seenRevision.current = reconciliationRevision;
    if (enabled) void load();
  }, [enabled, load, reconciliationRevision]);

  useEffect(() => {
    clearTimer();
    if (!enabled || !trip || TERMINAL_STATUSES.has(trip.status)) return undefined;
    let cancelled = false;
    const schedule = () => {
      const delay = connectionState === "connected" ? CONNECTED_RECONCILIATION_MS : RECOVERY_REFRESH_MS;
      timer.current = setTimeout(async () => {
        await load();
        if (!cancelled) schedule();
      }, delay);
    };
    schedule();
    return () => {
      cancelled = true;
      clearTimer();
    };
  }, [clearTimer, connectionState, enabled, load, trip?.id, trip?.status]);

  useEffect(() => clearTimer, [clearTimer]);
  return { trip, loading, refreshing, error, reload: load, setTrip, realtimeState: connectionState };
}

export function useHailingDriverWorkspace(autoRefresh = true) {
  const { connectionState, reconciliationRevision, subscribe } = useRealtime();
  const [status, setStatus] = useState<HailingDriverStatus | null>(null);
  const [offer, setOffer] = useState<HailingDispatchOffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const seenRevision = useRef(reconciliationRevision);

  const clearTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const load = useCallback(() => {
    if (inFlight.current) return inFlight.current;
    setRefreshing(true);
    let request!: Promise<void>;
    request = Promise.all([
      getHailingDriverStatus(),
      getHailingDriverOffer().catch(() => null),
    ]).then(([nextStatus, nextOffer]) => {
      setStatus(nextStatus);
      setOffer(nextOffer);
      setError(null);
    }).catch((err) => {
      setError(err instanceof Error ? err.message : "Unable to refresh Ride Now driver status.");
    }).finally(() => {
      setLoading(false);
      setRefreshing(false);
      if (inFlight.current === request) inFlight.current = null;
    });
    inFlight.current = request;
    return request;
  }, []);

  useScreenReconciliation(load);

  useEffect(() => subscribe((event) => {
    if (event.resource_type === "hailing_offer" || event.resource_type === "hailing_trip") void load();
  }), [load, subscribe]);

  useEffect(() => {
    if (seenRevision.current === reconciliationRevision) return;
    seenRevision.current = reconciliationRevision;
    void load();
  }, [load, reconciliationRevision]);

  useEffect(() => {
    clearTimer();
    const active = status?.active_trip && !TERMINAL_STATUSES.has(status.active_trip.status);
    const waiting = status?.presence?.status === "available" || status?.presence?.status === "offered";
    if (!autoRefresh || (!active && !offer && !waiting)) return undefined;
    let cancelled = false;
    const schedule = () => {
      const delay = connectionState === "connected" ? CONNECTED_RECONCILIATION_MS : RECOVERY_REFRESH_MS;
      timer.current = setTimeout(async () => {
        await load();
        if (!cancelled) schedule();
      }, delay);
    };
    schedule();
    return () => {
      cancelled = true;
      clearTimer();
    };
  }, [autoRefresh, clearTimer, connectionState, load, Boolean(offer), status?.active_trip?.id, status?.active_trip?.status, status?.presence?.status]);

  useEffect(() => clearTimer, [clearTimer]);
  return { status, offer, loading, refreshing, error, reload: load, setStatus, setOffer, realtimeState: connectionState };
}
