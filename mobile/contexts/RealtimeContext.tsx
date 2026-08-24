import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";

import { realtimeService } from "../services/realtimeService";
import { onSessionCleared } from "../services/sessionLifecycle";
import { RealtimeConnectionState, RealtimeEventEnvelope } from "../types/realtime.types";
import { useSession } from "./SessionContext";


type RealtimeContextValue = {
  connectionState: RealtimeConnectionState;
  reconciliationRevision: number;
  reconnect: () => void;
  subscribe: (listener: (event: RealtimeEventEnvelope) => void) => () => void;
};

const RealtimeContext = createContext<RealtimeContextValue>({
  connectionState: "idle",
  reconciliationRevision: 0,
  reconnect: () => undefined,
  subscribe: () => () => undefined,
});

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user, loading, isGuest, invalidateSession } = useSession();
  const [connectionState, setConnectionState] = useState<RealtimeConnectionState>(realtimeService.connectionState);
  const [reconciliationRevision, setReconciliationRevision] = useState(0);
  const sessionKey = user && !isGuest ? `${user.id}:${user.role}` : null;
  const sessionKeyRef = useRef<string | null>(sessionKey);
  sessionKeyRef.current = sessionKey;

  useEffect(() => realtimeService.onStateChange(setConnectionState), []);
  useEffect(() => realtimeService.onReconciliationNeeded(() => {
    setReconciliationRevision((current) => current + 1);
  }), []);
  useEffect(() => realtimeService.onAuthenticationFailure(() => {
    void invalidateSession();
  }), [invalidateSession]);
  useEffect(() => onSessionCleared(() => realtimeService.stop(true)), []);

  useEffect(() => {
    if (loading) return undefined;
    setReconciliationRevision(0);
    if (!sessionKey) {
      realtimeService.stop(true);
      return undefined;
    }
    void realtimeService.start(sessionKey);
    if (AppState.currentState !== "active") realtimeService.suspend();
    return () => realtimeService.stop(true);
  }, [loading, sessionKey]);

  useEffect(() => {
    let active = AppState.currentState === "active";
    const subscription = AppState.addEventListener("change", (nextState) => {
      const resumed = !active && nextState === "active";
      active = nextState === "active";
      if (!active) {
        realtimeService.suspend();
      } else if (resumed && sessionKeyRef.current) {
        void realtimeService.resume();
      }
    });
    return () => subscription.remove();
  }, []);

  const reconnect = useCallback(() => realtimeService.reconnect(), []);
  const subscribe = useCallback((listener: (event: RealtimeEventEnvelope) => void) => realtimeService.onEvent(listener), []);
  const value = useMemo(
    () => ({ connectionState, reconciliationRevision, reconnect, subscribe }),
    [connectionState, reconciliationRevision, reconnect, subscribe],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime() {
  return useContext(RealtimeContext);
}
