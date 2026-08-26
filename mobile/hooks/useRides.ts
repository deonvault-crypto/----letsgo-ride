import { useCallback, useMemo, useRef, useState } from "react";

import { Ride, RideSearchParams } from "../types/ride.types";
import { listRides, searchRides } from "../services/ridesService";
import { useScreenReconciliation } from "./useScreenReconciliation";

const snapshots = new Map<string, Ride[]>();
const requests = new Map<string, Promise<Ride[]>>();

function discoveryKey(params?: RideSearchParams) {
  if (!params) return "public:all";
  return `public:${params.origin || ""}|${params.destination || ""}|${params.date || ""}|${params.seats || 1}`;
}

function fetchSnapshot(key: string, params?: RideSearchParams) {
  const existing = requests.get(key);
  if (existing) return existing;
  const request = (params ? searchRides(params) : listRides()).finally(() => {
    if (requests.get(key) === request) requests.delete(key);
  });
  requests.set(key, request);
  return request;
}

export function clearRideDiscoveryCache() {
  snapshots.clear();
  requests.clear();
}

export function useRides(params?: RideSearchParams) {
  const key = useMemo(() => discoveryKey(params), [params?.date, params?.destination, params?.origin, params?.seats]);
  const cached = snapshots.get(key);
  const [rides, setRides] = useState<Ride[]>(cached || []);
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const requestGeneration = ++generation.current;
    const hasVisibleSnapshot = snapshots.has(key);
    if (hasVisibleSnapshot) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await fetchSnapshot(key, params);
      if (generation.current !== requestGeneration) return;
      snapshots.set(key, data);
      setRides(data);
      setError(null);
    } catch (nextError) {
      if (generation.current !== requestGeneration) return;
      setError(nextError instanceof Error ? nextError.message : "Unable to refresh rides.");
    } finally {
      if (generation.current === requestGeneration) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [key, params?.origin, params?.destination, params?.date, params?.seats]);

  useScreenReconciliation(load);

  return { rides, loading, refreshing, error, reload: load };
}
