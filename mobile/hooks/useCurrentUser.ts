import { useCallback, useRef, useState } from "react";

import { getCurrentUser, hasSession } from "../services/authService";
import { User } from "../types/user.types";
import { useLiveRefresh } from "./useLiveRefresh";

export function useCurrentUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const hasLoaded = useRef(false);

  const load = useCallback(async () => {
    try {
      if (!hasLoaded.current) setLoading(true);
      setError(null);

      const session = await hasSession();
      if (!session) {
        setUser(null);
        setIsGuest(true);
        hasLoaded.current = true;
        return;
      }

      setUser(await getCurrentUser());
      setIsGuest(false);
      hasLoaded.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load account.");
      setUser(null);
      setIsGuest(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useLiveRefresh(load, 30000);

  return { user, loading, error, isGuest, reload: load };
}
