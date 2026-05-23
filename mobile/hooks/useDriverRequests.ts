import { useCallback, useState } from "react";

import { RideRequest } from "../types/ride.types";
import { driverRideRequests } from "../services/ridesService";
import { useLiveRefresh } from "./useLiveRefresh";

export function useDriverRequests() {
  const [requests, setRequests] = useState<RideRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setRequests(await driverRideRequests());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load passenger requests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useLiveRefresh(load);

  return { requests, loading, error, reload: load };
}
