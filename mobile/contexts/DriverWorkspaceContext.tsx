import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { getDriverWorkspace } from "../services/ridesService";
import type { Ride, RideRequest } from "../types/ride.types";
import {
  applyRideEvent,
  applyRideRequestEvent,
  authoritativeRide,
  authoritativeRideRequest,
  rideFromEvent,
  rideRequestFromEvent,
  sortDriverRides,
  sortRideRequests,
} from "../utils/rideRealtime";
import { useRealtime } from "./RealtimeContext";
import { useSession } from "./SessionContext";


type DriverWorkspaceValue = {
  rides: Ride[];
  requests: RideRequest[];
  loading: boolean;
  error: string | null;
  reconcile: () => Promise<void>;
  upsertRide: (ride: Ride) => void;
  upsertRequest: (request: RideRequest) => void;
};

const DriverWorkspaceContext = createContext<DriverWorkspaceValue | null>(null);

export function DriverWorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const { reconciliationRevision, subscribe } = useRealtime();
  const [rides, setRides] = useState<Ride[]>([]);
  const [requests, setRequests] = useState<RideRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const ridesRef = useRef(new Map<string, Ride>());
  const requestsRef = useRef(new Map<string, RideRequest>());
  const mounted = useRef(true);
  const sessionGeneration = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);
  const seenRevision = useRef(reconciliationRevision);

  const replaceRides = useCallback((next: Ride[]) => {
    ridesRef.current = new Map(next.map((ride) => [ride.id, ride]));
    setRides(sortDriverRides(next));
  }, []);

  const replaceRequests = useCallback((next: RideRequest[]) => {
    requestsRef.current = new Map(next.map((request) => [request.id, request]));
    setRequests(sortRideRequests(next));
  }, []);

  const reconcile = useCallback(() => {
    if (inFlight.current) return inFlight.current;
    const generation = sessionGeneration.current;
    let request!: Promise<void>;
    request = getDriverWorkspace()
      .then((snapshot) => {
        if (!mounted.current || generation !== sessionGeneration.current) return;
        replaceRides(snapshot.rides);
        replaceRequests(snapshot.requests);
        setError(null);
      })
      .catch((err) => {
        if (mounted.current) setError(err instanceof Error ? err.message : "Unable to load your Driver workspace.");
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
        if (inFlight.current === request) inFlight.current = null;
      });
    inFlight.current = request;
    return request;
  }, [replaceRequests, replaceRides]);

  const upsertRide = useCallback((next: Ride) => {
    const accepted = authoritativeRide(ridesRef.current.get(next.id) || null, next);
    ridesRef.current.set(accepted.id, accepted);
    setRides(sortDriverRides([...ridesRef.current.values()]));
  }, []);

  const upsertRequest = useCallback((next: RideRequest) => {
    const accepted = authoritativeRideRequest(requestsRef.current.get(next.id) || null, next);
    requestsRef.current.set(accepted.id, accepted);
    setRequests(sortRideRequests([...requestsRef.current.values()]));
    if (accepted.ride_snapshot) upsertRide(accepted.ride_snapshot);
  }, [upsertRide]);

  useEffect(() => {
    mounted.current = true;
    sessionGeneration.current += 1;
    inFlight.current = null;
    replaceRides([]);
    replaceRequests([]);
    setError(null);
    if (user?.role === "driver") {
      setLoading(true);
      void reconcile();
    } else setLoading(false);
    return () => {
      mounted.current = false;
      sessionGeneration.current += 1;
    };
  }, [reconcile, replaceRequests, replaceRides, user?.id, user?.role]);

  useEffect(() => subscribe((event) => {
    if (event.resource_type === "ride") {
      const current = ridesRef.current.get(event.resource_id);
      if (!current) {
        const created = rideFromEvent(event);
        if (created) upsertRide(created);
        else void reconcile();
        return;
      }
      const result = applyRideEvent(current, event);
      if (result.needsReconciliation) void reconcile();
      else if (result.applied) upsertRide(result.value);
      return;
    }
    if (event.resource_type !== "ride_request") return;
    const current = requestsRef.current.get(event.resource_id);
    if (!current) {
      const created = rideRequestFromEvent(event);
      if (created) upsertRequest(created);
      else void reconcile();
      return;
    }
    const result = applyRideRequestEvent(current, event);
    if (result.needsReconciliation) void reconcile();
    else if (result.applied) upsertRequest(result.value);
  }), [reconcile, subscribe, upsertRequest, upsertRide]);

  useEffect(() => {
    if (seenRevision.current === reconciliationRevision) return;
    seenRevision.current = reconciliationRevision;
    if (user?.role === "driver") void reconcile();
  }, [reconcile, reconciliationRevision, user?.role]);

  const value = useMemo(
    () => ({ rides, requests, loading, error, reconcile, upsertRide, upsertRequest }),
    [rides, requests, loading, error, reconcile, upsertRide, upsertRequest],
  );
  return <DriverWorkspaceContext.Provider value={value}>{children}</DriverWorkspaceContext.Provider>;
}

export function useDriverWorkspace() {
  const context = useContext(DriverWorkspaceContext);
  if (!context) throw new Error("useDriverWorkspace must be used inside DriverWorkspaceProvider.");
  return context;
}
