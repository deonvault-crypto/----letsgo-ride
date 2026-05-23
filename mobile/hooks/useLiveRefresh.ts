import { useCallback } from "react";
import { useFocusEffect } from "expo-router";

export function useLiveRefresh(refresh: () => void | Promise<void>, intervalMs = 15000) {
  useFocusEffect(
    useCallback(() => {
      let active = true;

      const run = async () => {
        if (!active) return;
        await refresh();
      };

      run();
      const interval = setInterval(run, intervalMs);

      return () => {
        active = false;
        clearInterval(interval);
      };
    }, [refresh, intervalMs]),
  );
}
