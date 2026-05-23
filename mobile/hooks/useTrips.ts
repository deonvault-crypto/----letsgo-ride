import { useCallback, useRef, useState } from "react";

import { RideRequest } from "../types/ride.types";
import { myRideRequests } from "../services/ridesService";
import { useLiveRefresh } from "./useLiveRefresh";

export function useTrips() {
  const [trips, setTrips] = useState<RideRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoaded = useRef(false);

  const load = useCallback(async () => {
    try {
      if (!hasLoaded.current) setLoading(true);
      setError(null);
      setTrips(await myRideRequests());
      hasLoaded.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load trips.");
    } finally {
      setLoading(false);
    }
  }, []);

  useLiveRefresh(load);

  return { trips, loading, error, reload: load };
}
