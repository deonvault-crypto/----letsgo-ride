import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";

/** Runs one refresh on focus and one after a foreground resume. Never schedules a timer. */
export function useScreenReconciliation(refresh: () => void | Promise<void>, enabled = true, reconcileOnResume = true) {
  const focused = useRef(false);
  const inFlight = useRef<Promise<void> | null>(null);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  const run = useCallback(() => {
    if (!enabled || inFlight.current) return;
    const request = Promise.resolve(refreshRef.current()).finally(() => {
      if (inFlight.current === request) inFlight.current = null;
    });
    inFlight.current = request;
  }, [enabled]);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    run();
    return () => { focused.current = false; };
  }, [run]));

  useEffect(() => {
    let active = AppState.currentState === "active";
    const subscription = AppState.addEventListener("change", (nextState) => {
      const resumed = !active && nextState === "active";
      active = nextState === "active";
      if (reconcileOnResume && resumed && focused.current) run();
    });
    return () => subscription.remove();
  }, [reconcileOnResume, run]);
}
