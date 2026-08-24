import { useCallback, useEffect, useRef, useState } from "react";

import { useRealtime } from "../contexts/RealtimeContext";
import { getRestaurantWorkspace } from "../services/merchantService";
import type { FoodOrder } from "../types/food.types";
import type { MerchantDashboardData } from "../types/merchant.types";
import { applyFoodOrderEvent, authoritativeFoodOrder, foodOrderFromCreatedEvent } from "../utils/foodOrderRealtime";


export function useMerchantOrdersRealtime(restaurantId: string | undefined) {
  const { reconciliationRevision, subscribe } = useRealtime();
  const [workspace, setWorkspace] = useState<MerchantDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const workspaceRef = useRef<MerchantDashboardData | null>(null);
  const restaurantIdRef = useRef(restaurantId);
  restaurantIdRef.current = restaurantId;
  const mounted = useRef(true);
  const opened = useRef(false);
  const seenReconciliationRevision = useRef(reconciliationRevision);
  const snapshotInFlight = useRef<{ restaurantId: string; key: object; promise: Promise<void> } | null>(null);

  const acceptOrder = useCallback((incoming: FoodOrder) => {
    const currentWorkspace = workspaceRef.current;
    if (!currentWorkspace || incoming.restaurant_id !== restaurantIdRef.current) return;
    const index = currentWorkspace.orders.findIndex((item) => item.id === incoming.id);
    const order = authoritativeFoodOrder(index >= 0 ? currentWorkspace.orders[index] : null, incoming);
    const orders = index >= 0
      ? currentWorkspace.orders.map((item, itemIndex) => itemIndex === index ? order : item)
      : [order, ...currentWorkspace.orders];
    const next = { ...currentWorkspace, orders };
    workspaceRef.current = next;
    setWorkspace(next);
  }, []);

  const reconcile = useCallback(async (showError = false) => {
    if (!restaurantId) {
      workspaceRef.current = null;
      setWorkspace(null);
      setLoading(false);
      return;
    }
    if (snapshotInFlight.current?.restaurantId === restaurantId) return snapshotInFlight.current.promise;
    const key = {};
    const request = (async () => {
      try {
        const next = await getRestaurantWorkspace(restaurantId);
        if (!mounted.current || restaurantIdRef.current !== restaurantId) return;
        workspaceRef.current = next;
        setWorkspace(next);
        setError(null);
      } catch (err) {
        if (!mounted.current || restaurantIdRef.current !== restaurantId) return;
        if (showError || !workspaceRef.current) setError(err instanceof Error ? err.message : "Unable to load restaurant orders.");
        else console.warn("merchant_orders_reconciliation_failed", err);
      } finally {
        if (mounted.current && restaurantIdRef.current === restaurantId) setLoading(false);
        if (snapshotInFlight.current?.key === key) snapshotInFlight.current = null;
      }
    })();
    snapshotInFlight.current = { restaurantId, key, promise: request };
    return request;
  }, [restaurantId]);

  useEffect(() => {
    mounted.current = true;
    opened.current = Boolean(restaurantId);
    workspaceRef.current = null;
    setWorkspace(null);
    setError(null);
    setLoading(Boolean(restaurantId));
    if (restaurantId) void reconcile(true);
    return () => { mounted.current = false; };
  }, [reconcile, restaurantId]);

  useEffect(() => subscribe((event) => {
    if (event.resource_type !== "food_order" || event.payload.restaurant_id !== restaurantIdRef.current) return;
    if (!workspaceRef.current) {
      void reconcile(false);
      return;
    }
    const current = workspaceRef.current?.orders.find((item) => item.id === event.resource_id);
    if (!current) {
      const created = foodOrderFromCreatedEvent(event);
      if (created) acceptOrder(created);
      else void reconcile(false);
      return;
    }
    const result = applyFoodOrderEvent(current, event);
    if (result.needsReconciliation) {
      void reconcile(false);
      return;
    }
    if (result.applied) acceptOrder(result.order);
  }), [acceptOrder, reconcile, subscribe]);

  useEffect(() => {
    if (seenReconciliationRevision.current === reconciliationRevision) return;
    seenReconciliationRevision.current = reconciliationRevision;
    if (opened.current) void reconcile(false);
  }, [reconcile, reconciliationRevision]);

  return { workspace, loading, error, setError, acceptOrder, reconcile: () => reconcile(true) };
}
