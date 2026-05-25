import { useCallback, useRef, useState } from "react";

import { myRides } from "../services/ridesService";
import { Ride } from "../types/ride.types";
import { useLiveRefresh } from "./useLiveRefresh";

export function useDriverRides() {
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoaded = useRef(false);

  const load = useCallback(async () => {
    try {
      if (!hasLoaded.current) setLoading(true);
      setError(null);
      setRides(await myRides());
      hasLoaded.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load driver trips.");
    } finally {
      setLoading(false);
    }
  }, []);

  useLiveRefresh(load);

  return { rides, loading, error, reload: load };
}
