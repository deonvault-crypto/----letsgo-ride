import { useCallback } from "react";
import { useFocusEffect } from "expo-router";
import { AppState } from "react-native";

export function useLiveRefresh(refresh: () => void | Promise<void>, intervalMs = 15000, enabled = true) {
  useFocusEffect(
    useCallback(() => {
      let active = true;
      let appActive = !["background", "inactive"].includes(String(AppState.currentState || "active"));

      const run = async () => {
        if (!active || !appActive || !enabled) return;
        await refresh();
      };

      void run();
      const interval = setInterval(run, intervalMs);
      const subscription = AppState.addEventListener("change", (nextState) => {
        const resumed = !appActive && nextState === "active";
        appActive = nextState === "active";
        if (resumed) void run();
      });

      return () => {
        active = false;
        clearInterval(interval);
        subscription.remove();
      };
    }, [refresh, intervalMs, enabled]),
  );
}
