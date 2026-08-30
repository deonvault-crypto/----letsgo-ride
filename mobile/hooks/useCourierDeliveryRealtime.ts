import { useCallback, useEffect, useRef, useState } from "react";

import { useRealtime } from "../contexts/RealtimeContext";
import { getCourierDelivery, getCourierDeliveryPin, getCourierEvents } from "../services/courierService";
import type { CourierDelivery, CourierDeliveryPin, CourierEvent, CourierStatus } from "../types/courier.types";
import { applyCourierDeliveryEvent, authoritativeDelivery } from "../utils/courierDeliveryRealtime";


const PIN_VISIBLE = new Set<CourierStatus>(["PICKED_UP", "IN_TRANSIT", "ARRIVING", "DELIVERED"]);
const TERMINAL_STATUSES = new Set<CourierStatus>(["DELIVERED", "CANCELLED", "FAILED"]);
const CONNECTED_RECONCILIATION_MS = 15_000;
const DISCONNECTED_RECONCILIATION_MS = 5_500;
const MAX_DISCONNECTED_RECONCILIATION_MS = 30_000;

export function useCourierDeliveryRealtime(
  deliveryId: string | undefined,
  options: { includeHandoffPin?: boolean } = {},
) {
  const { includeHandoffPin = false } = options;
  const { connectionState, reconciliationRevision, subscribe } = useRealtime();
  const [delivery, setDelivery] = useState<CourierDelivery | null>(null);
  const [events, setEvents] = useState<CourierEvent[]>([]);
  const [handoff, setHandoff] = useState<CourierDeliveryPin | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const deliveryRef = useRef<CourierDelivery | null>(null);
  const snapshotInFlight = useRef<{ deliveryId: string; key: object; promise: Promise<void> } | null>(null);
  const deliveryIdRef = useRef(deliveryId);
  deliveryIdRef.current = deliveryId;
  const mounted = useRef(true);
  const opened = useRef(false);
  const pinRequested = useRef(false);
  const seenReconciliationRevision = useRef(reconciliationRevision);
  const reconciliationFailures = useRef(0);
  const reconciliationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearReconciliationTimer = useCallback(() => {
    if (reconciliationTimer.current) clearTimeout(reconciliationTimer.current);
    reconciliationTimer.current = null;
  }, []);

  const acceptDelivery = useCallback((next: CourierDelivery) => {
    const accepted = authoritativeDelivery(deliveryRef.current, next);
    deliveryRef.current = accepted;
    setDelivery(accepted);
    return accepted;
  }, []);

  const reconcile = useCallback(async (showInitialError = false) => {
    if (!deliveryId) return;
    if (snapshotInFlight.current?.deliveryId === deliveryId) return snapshotInFlight.current.promise;
    const requestKey = {};
    const request = (async () => {
      try {
        const [nextDelivery, nextEvents] = await Promise.all([
          getCourierDelivery(deliveryId),
          getCourierEvents(deliveryId),
        ]);
        if (!mounted.current || deliveryIdRef.current !== deliveryId) return;
        reconciliationFailures.current = 0;
        acceptDelivery(nextDelivery);
        setEvents(nextEvents);
        setError(null);
      } catch (err) {
        if (!mounted.current || deliveryIdRef.current !== deliveryId) return;
        reconciliationFailures.current = Math.min(reconciliationFailures.current + 1, 4);
        if (showInitialError || !deliveryRef.current) {
          setError(err instanceof Error ? err.message : "Unable to load this delivery.");
        } else {
          console.warn("courier_delivery_reconciliation_failed", err);
        }
      } finally {
        if (mounted.current && deliveryIdRef.current === deliveryId) setLoading(false);
        if (snapshotInFlight.current?.key === requestKey) snapshotInFlight.current = null;
      }
    })();
    snapshotInFlight.current = { deliveryId, key: requestKey, promise: request };
    return request;
  }, [acceptDelivery, deliveryId]);

  useEffect(() => {
    mounted.current = true;
    opened.current = false;
    deliveryRef.current = null;
    pinRequested.current = false;
    reconciliationFailures.current = 0;
    clearReconciliationTimer();
    setDelivery(null);
    setEvents([]);
    setHandoff(null);
    setLoading(true);
    if (deliveryId) {
      opened.current = true;
      void reconcile(true);
    }
    return () => {
      mounted.current = false;
      clearReconciliationTimer();
    };
  }, [clearReconciliationTimer, deliveryId, reconcile]);

  useEffect(() => subscribe((event) => {
    const current = deliveryRef.current;
    if (!current || event.resource_id !== deliveryId || event.resource_type !== "courier_delivery") return;
    const result = applyCourierDeliveryEvent(current, event);
    if (result.needsReconciliation) {
      void reconcile(false);
      return;
    }
    if (!result.applied) return;
    deliveryRef.current = result.delivery;
    setDelivery(result.delivery);
    if (result.journeyEvent) {
      setEvents((items) => items.some((item) => item.id === result.journeyEvent?.id) ? items : [...items, result.journeyEvent as CourierEvent]);
    }
  }), [deliveryId, reconcile, subscribe]);

  useEffect(() => {
    if (seenReconciliationRevision.current === reconciliationRevision) return;
    seenReconciliationRevision.current = reconciliationRevision;
    if (opened.current) void reconcile(false);
  }, [reconcile, reconciliationRevision]);

  // WebSocket events remain primary. While an active delivery exists, REST performs
  // a slow safety reconciliation even when the socket says connected so a single
  // lost event cannot freeze the courier/customer state. Network failures back off.
  useEffect(() => {
    clearReconciliationTimer();
    const current = deliveryRef.current;
    if (!deliveryId || !current || TERMINAL_STATUSES.has(current.status)) return undefined;

    let cancelled = false;
    const schedule = () => {
      const failures = reconciliationFailures.current;
      const connected = connectionState === "connected";
      const base = connected
        ? CONNECTED_RECONCILIATION_MS
        : Math.min(MAX_DISCONNECTED_RECONCILIATION_MS, DISCONNECTED_RECONCILIATION_MS * (2 ** failures));
      const jitterWindow = connected ? 5_000 : Math.max(1_500, Math.round(base * 0.2));
      const delay = base + Math.floor(Math.random() * jitterWindow);
      reconciliationTimer.current = setTimeout(async () => {
        await reconcile(false);
        if (!cancelled) schedule();
      }, delay);
    };
    schedule();

    return () => {
      cancelled = true;
      clearReconciliationTimer();
    };
  }, [clearReconciliationTimer, connectionState, delivery?.id, delivery?.status, deliveryId, reconcile]);

  useEffect(() => {
    if (!includeHandoffPin || !deliveryId || !delivery || !PIN_VISIBLE.has(delivery.status) || pinRequested.current) return;
    pinRequested.current = true;
    void getCourierDeliveryPin(deliveryId)
      .then((value) => {
        if (mounted.current && deliveryIdRef.current === deliveryId) setHandoff(value);
      })
      .catch((err) => {
        if (deliveryIdRef.current === deliveryId) pinRequested.current = false;
        console.warn("courier_delivery_pin_fetch_failed", err);
      });
  }, [delivery?.status, deliveryId, includeHandoffPin]);

  const replaceEvents = useCallback((next: CourierEvent[]) => setEvents(next), []);
  const updateDeliveryLocally = useCallback((updater: (current: CourierDelivery | null) => CourierDelivery | null) => {
    const next = updater(deliveryRef.current);
    deliveryRef.current = next;
    setDelivery(next);
  }, []);
  return {
    delivery,
    events,
    handoff,
    loading,
    error,
    setError,
    acceptDelivery,
    updateDeliveryLocally,
    replaceEvents,
    reconcile: () => reconcile(true),
  };
}
