import { ReactNode, createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { getCurrentUser, hasSession, logout as logoutService } from "../services/authService";
import { ApiRequestError } from "../services/api";
import { clearPrivateSessionState, onSessionCleared, onSessionUserUpdated, readSessionUserSnapshot, writeSessionUserSnapshot } from "../services/sessionLifecycle";
import { User } from "../types/user.types";

type SessionState = {
  user: User | null;
  loading: boolean;
  error: string | null;
  isGuest: boolean;
  refreshSession: () => Promise<void>;
  updateUser: (user: User) => void;
  invalidateSession: () => Promise<void>;
  logout: () => Promise<void>;
};

const defaultSession: SessionState = {
  user: null,
  loading: true,
  error: null,
  isGuest: false,
  refreshSession: async () => undefined,
  updateUser: () => undefined,
  invalidateSession: async () => undefined,
  logout: async () => undefined,
};

const SessionContext = createContext<SessionState>(defaultSession);

function isAuthenticationFailure(error: unknown) {
  return (error instanceof ApiRequestError && (error.status === 401 || error.status === 403))
    || (error instanceof Error && error.message.toLowerCase().includes("session expired"));
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const mounted = useRef(true);
  const generation = useRef(0);
  const inFlight = useRef<{ generation: number; promise: Promise<void> } | null>(null);

  const applyUser = useCallback((nextUser: User) => {
    if (!mounted.current) return;
    setUser(nextUser);
    setIsGuest(false);
    setError(null);
    setLoading(false);
    void writeSessionUserSnapshot(nextUser);
  }, []);

  const updateUser = useCallback((nextUser: User) => {
    generation.current += 1;
    applyUser(nextUser);
  }, [applyUser]);

  const invalidateSession = useCallback(async () => {
    await clearPrivateSessionState();
  }, []);

  const refreshSession = useCallback(() => {
    const requestGeneration = generation.current;
    if (inFlight.current?.generation === requestGeneration) return inFlight.current.promise;
    let request!: Promise<void>;
    request = (async () => {
      try {
        const signedIn = await hasSession();
        if (generation.current !== requestGeneration) return;
        if (!signedIn) {
          if (mounted.current) {
            setUser(null);
            setIsGuest(true);
            setError(null);
          }
          return;
        }
        const nextUser = await getCurrentUser();
        if (generation.current === requestGeneration) applyUser(nextUser);
      } catch (nextError) {
        if (generation.current !== requestGeneration) return;
        if (isAuthenticationFailure(nextError)) {
          await clearPrivateSessionState();
          return;
        }
        if (mounted.current) {
          setError(nextError instanceof Error ? nextError.message : "Unable to load account.");
        }
      } finally {
        if (mounted.current && generation.current === requestGeneration) setLoading(false);
        if (inFlight.current?.promise === request) inFlight.current = null;
      }
    })();
    inFlight.current = { generation: requestGeneration, promise: request };
    return request;
  }, [applyUser]);

  const logout = useCallback(async () => {
    await logoutService();
  }, []);

  useEffect(() => {
    mounted.current = true;
    const removeCleared = onSessionCleared(() => {
      if (!mounted.current) return;
      generation.current += 1;
      setUser(null);
      setIsGuest(true);
      setError(null);
      setLoading(false);
    });
    const removeUpdated = onSessionUserUpdated(updateUser);
    void (async () => {
      const [signedIn, cachedUser] = await Promise.all([hasSession(), readSessionUserSnapshot()]);
      if (!mounted.current) return;
      if (!signedIn) {
        setUser(null);
        setIsGuest(true);
        setError(null);
        setLoading(false);
        return;
      }
      if (cachedUser) applyUser(cachedUser);
      else setLoading(false);
      void refreshSession();
    })();
    return () => {
      mounted.current = false;
      removeCleared();
      removeUpdated();
    };
  }, [refreshSession, updateUser]);

  useEffect(() => {
    let appActive = AppState.currentState === "active";
    const subscription = AppState.addEventListener("change", (nextState) => {
      const resumed = !appActive && nextState === "active";
      appActive = nextState === "active";
      if (resumed) void refreshSession();
    });
    return () => subscription.remove();
  }, [refreshSession]);

  return (
    <SessionContext.Provider value={{ user, loading, error, isGuest, refreshSession, updateUser, invalidateSession, logout }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
