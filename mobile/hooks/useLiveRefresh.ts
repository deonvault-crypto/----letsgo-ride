import { useCallback } from "react";
import { useFocusEffect } from "expo-router";
import { AppState } from "react-native";

export function useLiveRefresh(refresh: () => void | Promise<void>, intervalMs = 15000, enabled = true) {
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return undefined;

      let active = true;
      let appActive = !["background", "inactive"].includes(String(AppState.currentState || "active"));
      let inFlight = false;
      let interval: ReturnType<typeof setInterval> | null = null;

      const run = async () => {
        if (!active || !appActive || !enabled || inFlight) return;
        inFlight = true;
        try {
          await refresh();
        } finally {
          inFlight = false;
        }
      };

      const stopInterval = () => {
        if (!interval) return;
        clearInterval(interval);
        interval = null;
      };

      const startInterval = () => {
        if (!active || !appActive || interval) return;
        interval = setInterval(run, intervalMs);
      };

      if (appActive) {
        void run();
        startInterval();
      }
      const subscription = AppState.addEventListener("change", (nextState) => {
        const resumed = !appActive && nextState === "active";
        appActive = nextState === "active";
        if (!appActive) {
          stopInterval();
          return;
        }
        if (resumed) {
          void run();
          startInterval();
        }
      });

      return () => {
        active = false;
        stopInterval();
        subscription.remove();
      };
    }, [refresh, intervalMs, enabled]),
  );
}
