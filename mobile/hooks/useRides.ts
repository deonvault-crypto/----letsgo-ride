import { useCallback, useRef, useState } from "react";

import { Ride, RideSearchParams } from "../types/ride.types";
import { listRides, searchRides } from "../services/ridesService";
import { useLiveRefresh } from "./useLiveRefresh";

export function useRides(params?: RideSearchParams) {
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoaded = useRef(false);

  const load = useCallback(async () => {
    try {
      if (!hasLoaded.current) setLoading(true);
      setError(null);
      const data = params ? await searchRides(params) : await listRides();
      setRides(data);
      hasLoaded.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load rides.");
    } finally {
      setLoading(false);
    }
  }, [params?.origin, params?.destination, params?.date, params?.seats]);

  useLiveRefresh(load);

  return { rides, loading, error, reload: load };
}
