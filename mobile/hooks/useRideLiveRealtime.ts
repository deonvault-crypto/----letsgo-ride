import { useCallback, useEffect, useRef, useState } from "react";

import { useRealtime } from "../contexts/RealtimeContext";
import { getLiveTripState } from "../services/ridesService";
import type { LiveTripState, Ride } from "../types/ride.types";
import { applyLiveTripEvent } from "../utils/rideRealtime";


export function useRideLiveRealtime(ride: Ride, enabled: boolean) {
  const { reconciliationRevision, subscribe } = useRealtime();
  const [state, setState] = useState<LiveTripState | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");
  const stateRef = useRef<LiveTripState | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const mounted = useRef(true);
  const resourceKey = useRef("");
  const seenRevision = useRef(reconciliationRevision);

  const reconcile = useCallback(() => {
    if (!enabled) return Promise.resolve();
    if (inFlight.current) return inFlight.current;
    const requestedKey = `${ride.id}:${enabled}`;
    let request!: Promise<void>;
    request = getLiveTripState(ride.id)
      .then((next) => {
        if (!mounted.current || resourceKey.current !== requestedKey) return;
        stateRef.current = next;
        setState(next);
        setError("");
      })
      .catch((err) => {
        if (mounted.current) setError(err instanceof Error ? err.message : "Could not load live trip updates.");
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
        if (inFlight.current === request) inFlight.current = null;
      });
    inFlight.current = request;
    return request;
  }, [enabled, ride.id]);

  useEffect(() => {
    mounted.current = true;
    resourceKey.current = `${ride.id}:${enabled}`;
    inFlight.current = null;
    if (enabled) void reconcile();
    else {
      stateRef.current = null;
      setState(null);
      setLoading(false);
    }
    return () => {
      mounted.current = false;
      resourceKey.current = "";
    };
  }, [enabled, reconcile]);

  useEffect(() => subscribe((event) => {
    if (!enabled || event.resource_type !== "ride" || event.resource_id !== ride.id) return;
    const current = stateRef.current;
    if (!current) {
      void reconcile();
      return;
    }
    const result = applyLiveTripEvent(current, event);
    if (result.needsReconciliation) void reconcile();
    else if (result.applied) {
      stateRef.current = result.value;
      setState(result.value);
    }
  }), [enabled, reconcile, ride.id, subscribe]);

  useEffect(() => {
    if (seenRevision.current === reconciliationRevision) return;
    seenRevision.current = reconciliationRevision;
    if (enabled) void reconcile();
  }, [enabled, reconcile, reconciliationRevision]);

  return { state, loading, error, reconcile };
}
