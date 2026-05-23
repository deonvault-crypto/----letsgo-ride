import { useCallback, useState } from "react";

import { RideRequest } from "../types/ride.types";
import { myRideRequests } from "../services/ridesService";
import { useLiveRefresh } from "./useLiveRefresh";

export function useTrips() {
  const [trips, setTrips] = useState<RideRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setTrips(await myRideRequests());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load trips.");
    } finally {
      setLoading(false);
    }
  }, []);

  useLiveRefresh(load);

  return { trips, loading, error, reload: load };
}
