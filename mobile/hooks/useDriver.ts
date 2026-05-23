import { useCallback, useEffect, useState } from "react";

import { DriverProfile } from "../types/driver.types";
import { getDriverProfile } from "../services/driverService";

export function useDriver() {
  const [driver, setDriver] = useState<DriverProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setDriver(await getDriverProfile());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load driver profile.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { driver, loading, error, reload: load };
}
