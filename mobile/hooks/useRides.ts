import { useCallback, useEffect, useState } from "react";

import { Ride, RideSearchParams } from "../types/ride.types";
import { listRides, searchRides } from "../services/ridesService";

export function useRides(params?: RideSearchParams) {
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = params ? await searchRides(params) : await listRides();
      setRides(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load rides.");
    } finally {
      setLoading(false);
    }
  }, [params?.origin, params?.destination, params?.seats]);

  useEffect(() => {
    load();
  }, [load]);

  return { rides, loading, error, reload: load };
}
