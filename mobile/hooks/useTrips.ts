import { useCallback, useEffect, useRef, useState } from "react";

import { useRealtime } from "../contexts/RealtimeContext";
import { RideRequest } from "../types/ride.types";
import { myRideRequests } from "../services/ridesService";
import { applyRideEvent, applyRideRequestEvent, authoritativeRideRequest, rideRequestFromEvent, sortRideRequests } from "../utils/rideRealtime";

export function useTrips() {
  const { reconciliationRevision, subscribe } = useRealtime();
  const [trips, setTrips] = useState<RideRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoaded = useRef(false);
  const tripsRef = useRef(new Map<string, RideRequest>());
  const inFlight = useRef<Promise<void> | null>(null);
  const mounted = useRef(true);
  const seenRevision = useRef(reconciliationRevision);

  const replace = useCallback((next: RideRequest[]) => {
    tripsRef.current = new Map(next.map((trip) => [trip.id, trip]));
    setTrips(sortRideRequests(next));
  }, []);

  const upsertTrip = useCallback((next: RideRequest) => {
    const accepted = authoritativeRideRequest(tripsRef.current.get(next.id) || null, next);
    tripsRef.current.set(accepted.id, accepted);
    setTrips(sortRideRequests([...tripsRef.current.values()]));
  }, []);

  const load = useCallback(() => {
    if (inFlight.current) return inFlight.current;
    let request!: Promise<void>;
    if (!hasLoaded.current) setLoading(true);
    request = myRideRequests()
      .then((next) => {
        if (!mounted.current) return;
        replace(next);
        hasLoaded.current = true;
        setError(null);
      })
      .catch((err) => {
        if (mounted.current) setError(err instanceof Error ? err.message : "Unable to load trips.");
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
        if (inFlight.current === request) inFlight.current = null;
      });
    inFlight.current = request;
    return request;
  }, [replace]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; };
  }, [load]);

  useEffect(() => subscribe((event) => {
    if (event.resource_type === "ride_request") {
      const current = tripsRef.current.get(event.resource_id);
      if (!current) {
        const created = rideRequestFromEvent(event);
        if (created) upsertTrip(created);
        else void load();
        return;
      }
      const result = applyRideRequestEvent(current, event);
      if (result.needsReconciliation) void load();
      else if (result.applied) upsertTrip(result.value);
      return;
    }
    if (event.resource_type !== "ride") return;
    const matching = [...tripsRef.current.values()].filter((trip) => trip.ride_id === event.resource_id && trip.ride_snapshot);
    if (matching.length === 0) return;
    let needsReconciliation = false;
    for (const trip of matching) {
      const result = applyRideEvent(trip.ride_snapshot!, event);
      if (result.needsReconciliation) needsReconciliation = true;
      else if (result.applied) upsertTrip({ ...trip, ride_snapshot: result.value });
    }
    if (needsReconciliation) void load();
  }), [load, subscribe, upsertTrip]);

  useEffect(() => {
    if (seenRevision.current === reconciliationRevision) return;
    seenRevision.current = reconciliationRevision;
    void load();
  }, [load, reconciliationRevision]);

  return { trips, loading, error, reload: load, upsertTrip };
}
