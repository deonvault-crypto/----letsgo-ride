import { useCallback, useRef, useState } from "react";

import { getCurrentUser } from "../services/authService";
import { User } from "../types/user.types";
import { useLiveRefresh } from "./useLiveRefresh";

export function useCurrentUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoaded = useRef(false);

  const load = useCallback(async () => {
    try {
      if (!hasLoaded.current) setLoading(true);
      setError(null);
      setUser(await getCurrentUser());
      hasLoaded.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load account.");
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useLiveRefresh(load, 30000);

  return { user, loading, error, reload: load };
}
