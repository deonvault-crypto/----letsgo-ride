import fs from "fs";
import path from "path";
import { act, renderHook, waitFor } from "@testing-library/react-native";

import { useFoodOrderRealtime } from "../hooks/useFoodOrderRealtime";
import { useMerchantOrdersRealtime } from "../hooks/useMerchantOrdersRealtime";
import { getFoodOrder, getFoodOrderEvents } from "../services/foodService";
import { getRestaurantWorkspace } from "../services/merchantService";
import type { RealtimeEventEnvelope } from "../types/realtime.types";


let mockListener: ((event: RealtimeEventEnvelope) => void) | null = null;
let mockRevision = 0;

jest.mock("../contexts/RealtimeContext", () => ({
  useRealtime: () => ({
    reconciliationRevision: mockRevision,
    subscribe: (next: (event: RealtimeEventEnvelope) => void) => {
      mockListener = next;
      return jest.fn();
    },
  }),
}));

jest.mock("../services/foodService", () => ({
  getFoodOrder: jest.fn(),
  getFoodOrderEvents: jest.fn(),
}));

jest.mock("../services/merchantService", () => ({
  getRestaurantWorkspace: jest.fn(),
}));

const order = (overrides: Record<string, unknown> = {}) => ({
  id: "order-1",
  restaurant_id: "restaurant-1",
  restaurant_name: "Harare Kitchen",
  customer_user_id: "customer-1",
  status: "PENDING_RESTAURANT",
  restaurant_status: "PENDING_RESTAURANT",
  fulfillment_status: "NOT_STARTED",
  delivery_address: "Borrowdale, Harare",
  recipient_name: "Tariro",
  recipient_phone: "+263770000001",
  items: [{ menu_item_id: "item-1", name: "Chicken", quantity: 1, unit_price_usd: 8, line_total_usd: 8 }],
  subtotal_usd: 8,
  realtime_version: 1,
  created_at: "2027-01-01T10:00:00+00:00",
  ...overrides,
}) as any;

const event = (
  version: number,
  payload: Record<string, unknown>,
  resourceId = "order-1",
  type = "food_order.updated",
): RealtimeEventEnvelope => ({
  event_id: `event-${version}-${resourceId}`,
  type,
  resource_type: "food_order",
  resource_id: resourceId,
  version,
  occurred_at: "2027-01-01T10:05:00+00:00",
  payload: { restaurant_id: "restaurant-1", realtime_version: version, ...payload },
});

const workspace = (orders = [order()]) => ({
  restaurant: { id: "restaurant-1", name: "Harare Kitchen", address: "Harare", status: "ACTIVE", is_accepting_orders: true },
  categories: [],
  items: [],
  orders,
}) as any;

describe("Food and Merchant order realtime migration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListener = null;
    mockRevision = 0;
    (getFoodOrder as jest.Mock).mockResolvedValue(order());
    (getFoodOrderEvents as jest.Mock).mockResolvedValue([]);
    (getRestaurantWorkspace as jest.Mock).mockResolvedValue(workspace());
  });

  it("loads one Customer snapshot and history with no polling timer", async () => {
    renderHook(() => useFoodOrderRealtime("order-1"));
    await waitFor(() => expect(getFoodOrder).toHaveBeenCalledTimes(1));
    expect(getFoodOrderEvents).toHaveBeenCalledTimes(1);
    const source = fs.readFileSync(path.join(__dirname, "../app/(shared)/food/order/[orderId].tsx"), "utf8");
    expect(source).not.toContain("useLiveRefresh");
  });

  it("applies matching Food state, appends history once, and exposes courier tracking", async () => {
    const view = renderHook(() => useFoodOrderRealtime("order-1"));
    await waitFor(() => expect(view.result.current.order).not.toBeNull());
    act(() => mockListener?.(event(2, {
      restaurant_status: "PREPARING",
      status: "PREPARING",
      courier_delivery_id: "delivery-1",
      journey_event: { id: "journey-1", type: "RESTAURANT_PREPARING", created_at: "2027-01-01T10:05:00+00:00" },
    })));
    expect(view.result.current.order?.courier_delivery_id).toBe("delivery-1");
    expect(view.result.current.events).toHaveLength(1);
    act(() => mockListener?.(event(2, { status: "PREPARING" })));
    expect(view.result.current.events).toHaveLength(1);
    expect(getFoodOrderEvents).toHaveBeenCalledTimes(1);
  });

  it("ignores unrelated/stale events and reconciles once for a gap and resume", async () => {
    const view = renderHook(() => useFoodOrderRealtime("order-1"));
    await waitFor(() => expect(view.result.current.order?.status).toBe("PENDING_RESTAURANT"));
    act(() => mockListener?.(event(2, { status: "PREPARING" }, "order-2")));
    act(() => mockListener?.(event(1, { status: "CANCELLED" })));
    expect(view.result.current.order?.status).toBe("PENDING_RESTAURANT");
    (getFoodOrder as jest.Mock).mockResolvedValue(order({ realtime_version: 3, status: "READY_FOR_PICKUP" }));
    act(() => mockListener?.(event(3, { status: "READY_FOR_PICKUP" })));
    await waitFor(() => expect(getFoodOrder).toHaveBeenCalledTimes(2));
    mockRevision = 1;
    view.rerender(undefined);
    await waitFor(() => expect(getFoodOrder).toHaveBeenCalledTimes(3));
  });

  it("keeps terminal Customer state final", async () => {
    const view = renderHook(() => useFoodOrderRealtime("order-1"));
    await waitFor(() => expect(view.result.current.order).not.toBeNull());
    act(() => mockListener?.(event(2, { status: "CANCELLED", restaurant_status: "CANCELLED" }, "order-1", "food_order.terminal")));
    expect(view.result.current.order?.status).toBe("CANCELLED");
    (getFoodOrder as jest.Mock).mockResolvedValue(order({ realtime_version: 3, status: "PREPARING" }));
    act(() => mockListener?.(event(3, { status: "PREPARING" })));
    await waitFor(() => expect(getFoodOrder).toHaveBeenCalledTimes(2));
    expect(view.result.current.order?.status).toBe("CANCELLED");
  });

  it("loads Merchant workspace once and inserts a sanitized new-order ticket", async () => {
    (getRestaurantWorkspace as jest.Mock).mockResolvedValue(workspace([]));
    const view = renderHook(() => useMerchantOrdersRealtime("restaurant-1"));
    await waitFor(() => expect(view.result.current.workspace).not.toBeNull());
    act(() => mockListener?.(event(1, {
      merchant_ticket: { ...order(), customer_user_id: undefined, recipient_phone: undefined },
    }, "order-1", "food_order.created")));
    expect(view.result.current.workspace?.orders).toHaveLength(1);
    expect(view.result.current.workspace?.orders[0].recipient_phone).toBe("");
    expect(getRestaurantWorkspace).toHaveBeenCalledTimes(1);
    const source = fs.readFileSync(path.join(__dirname, "../app/(merchant)/home.tsx"), "utf8");
    expect(source).not.toContain("useLiveRefresh");
    expect(source).not.toContain("await load()");
  });

  it("updates Merchant tickets locally and isolates the selected restaurant", async () => {
    const view = renderHook(() => useMerchantOrdersRealtime("restaurant-1"));
    await waitFor(() => expect(view.result.current.workspace).not.toBeNull());
    act(() => mockListener?.(event(2, { restaurant_status: "PREPARING", status: "PREPARING" })));
    expect(view.result.current.workspace?.orders[0].restaurant_status).toBe("PREPARING");
    act(() => mockListener?.(event(3, { restaurant_id: "restaurant-2", status: "CANCELLED" })));
    expect(view.result.current.workspace?.orders[0].status).toBe("PREPARING");
    act(() => view.result.current.acceptOrder(order({ realtime_version: 3, status: "READY_FOR_PICKUP", restaurant_status: "READY_FOR_PICKUP" })));
    expect(view.result.current.workspace?.orders[0].status).toBe("READY_FOR_PICKUP");
    expect(getRestaurantWorkspace).toHaveBeenCalledTimes(1);
  });

  it("reconciles Merchant workspace once for a gap and once after reconnect", async () => {
    const view = renderHook(() => useMerchantOrdersRealtime("restaurant-1"));
    await waitFor(() => expect(getRestaurantWorkspace).toHaveBeenCalledTimes(1));
    (getRestaurantWorkspace as jest.Mock).mockResolvedValue(workspace([order({ realtime_version: 3, status: "PREPARING" })]));
    act(() => mockListener?.(event(3, { status: "PREPARING" })));
    await waitFor(() => expect(getRestaurantWorkspace).toHaveBeenCalledTimes(2));
    mockRevision = 1;
    view.rerender(undefined);
    await waitFor(() => expect(getRestaurantWorkspace).toHaveBeenCalledTimes(3));
  });
});
