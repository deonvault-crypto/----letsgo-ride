import { useCallback, useEffect, useRef, useState } from "react";

import { useRealtime } from "../contexts/RealtimeContext";
import { getFoodOrder, getFoodOrderEvents } from "../services/foodService";
import type { FoodOrder, FoodOrderEvent } from "../types/food.types";
import { applyFoodOrderEvent, authoritativeFoodOrder } from "../utils/foodOrderRealtime";


export function useFoodOrderRealtime(orderId: string | undefined) {
  const { reconciliationRevision, subscribe } = useRealtime();
  const [order, setOrder] = useState<FoodOrder | null>(null);
  const [events, setEvents] = useState<FoodOrderEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const orderRef = useRef<FoodOrder | null>(null);
  const orderIdRef = useRef(orderId);
  orderIdRef.current = orderId;
  const mounted = useRef(true);
  const opened = useRef(false);
  const seenReconciliationRevision = useRef(reconciliationRevision);
  const snapshotInFlight = useRef<{ orderId: string; key: object; promise: Promise<void> } | null>(null);

  const acceptOrder = useCallback((next: FoodOrder) => {
    const accepted = authoritativeFoodOrder(orderRef.current, next);
    orderRef.current = accepted;
    setOrder(accepted);
    return accepted;
  }, []);

  const reconcile = useCallback(async (showError = false) => {
    if (!orderId) return;
    if (snapshotInFlight.current?.orderId === orderId) return snapshotInFlight.current.promise;
    const key = {};
    const request = (async () => {
      try {
        const [nextOrder, nextEvents] = await Promise.all([getFoodOrder(orderId), getFoodOrderEvents(orderId)]);
        if (!mounted.current || orderIdRef.current !== orderId) return;
        acceptOrder(nextOrder);
        setEvents(nextEvents);
        setError(null);
      } catch (err) {
        if (!mounted.current || orderIdRef.current !== orderId) return;
        if (showError || !orderRef.current) setError(err instanceof Error ? err.message : "Unable to load this order.");
        else console.warn("food_order_reconciliation_failed", err);
      } finally {
        if (mounted.current && orderIdRef.current === orderId) setLoading(false);
        if (snapshotInFlight.current?.key === key) snapshotInFlight.current = null;
      }
    })();
    snapshotInFlight.current = { orderId, key, promise: request };
    return request;
  }, [acceptOrder, orderId]);

  useEffect(() => {
    mounted.current = true;
    opened.current = false;
    orderRef.current = null;
    setOrder(null);
    setEvents([]);
    setError(null);
    setLoading(true);
    if (orderId) {
      opened.current = true;
      void reconcile(true);
    }
    return () => { mounted.current = false; };
  }, [orderId, reconcile]);

  useEffect(() => subscribe((event) => {
    const current = orderRef.current;
    if (!current || event.resource_type !== "food_order" || event.resource_id !== orderId) return;
    const result = applyFoodOrderEvent(current, event);
    if (result.needsReconciliation) {
      void reconcile(false);
      return;
    }
    if (!result.applied) return;
    orderRef.current = result.order;
    setOrder(result.order);
    if (result.journeyEvent) {
      setEvents((items) => items.some((item) => item.id === result.journeyEvent?.id) ? items : [...items, result.journeyEvent as FoodOrderEvent]);
    }
  }), [orderId, reconcile, subscribe]);

  useEffect(() => {
    if (seenReconciliationRevision.current === reconciliationRevision) return;
    seenReconciliationRevision.current = reconciliationRevision;
    if (opened.current) void reconcile(false);
  }, [reconcile, reconciliationRevision]);

  return { order, events, loading, error, setError, acceptOrder, reconcile: () => reconcile(true) };
}
