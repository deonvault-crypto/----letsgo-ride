import { useCallback, useEffect, useRef } from "react";
import { useFocusEffect } from "expo-router";

import { useRealtime } from "../contexts/RealtimeContext";
import { useScreenReconciliation } from "./useScreenReconciliation";

export const ADMIN_CONNECTED_RECONCILIATION_MS = 15000;
export const ADMIN_RECOVERY_RECONCILIATION_MS = 8000;

const ADMIN_EVENT_RESOURCES = new Set([
  "user",
  "driver",
  "verification",
  "ride",
  "ride_request",
  "hailing_trip",
  "courier_delivery",
  "food_order",
  "support_message",
  "safety_report",
  "worker_application",
  "notification",
  "profile_photo",
]);

/**
 * Coordinates the four intentionally distinct admin refresh guarantees:
 * focus/resume reconciliation, relevant realtime events, socket-ready recovery,
 * and a bounded safety refresh while the control center remains focused.
 */
export function useAdminReconciliation(refreshVisible: () => void | Promise<void>) {
  const { connectionState, reconciliationRevision, subscribe, reconnect } = useRealtime();
  const seenRevision = useRef(reconciliationRevision);

  useScreenReconciliation(refreshVisible);

  useEffect(() => subscribe((event) => {
    if (!ADMIN_EVENT_RESOURCES.has(String(event.resource_type))) return;
    void refreshVisible();
  }), [refreshVisible, subscribe]);

  useEffect(() => {
    if (seenRevision.current === reconciliationRevision) return;
    seenRevision.current = reconciliationRevision;
    void refreshVisible();
  }, [reconciliationRevision, refreshVisible]);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      const delay = connectionState === "connected"
        ? ADMIN_CONNECTED_RECONCILIATION_MS
        : ADMIN_RECOVERY_RECONCILIATION_MS;
      timer = setTimeout(async () => {
        await refreshVisible();
        if (!cancelled) schedule();
      }, delay);
    };

    schedule();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [connectionState, refreshVisible]));

  return { connectionState, reconnect };
}
