import { useCallback, useRef, useState } from "react";

import { Ride, RideSearchParams } from "../types/ride.types";
import { listRides, searchRides } from "../services/ridesService";
import { useScreenReconciliation } from "./useScreenReconciliation";

export function useRides(params?: RideSearchParams) {
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasLoaded = useRef(false);

  const load = useCallback(async () => {
    try {
      if (!hasLoaded.current) setLoading(true);
      else setRefreshing(true);
      setError(null);
      const data = params ? await searchRides(params) : await listRides();
      setRides(data);
      hasLoaded.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load rides.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [params?.origin, params?.destination, params?.date, params?.seats]);

  useScreenReconciliation(load);

  return { rides, loading, refreshing, error, reload: load };
}
