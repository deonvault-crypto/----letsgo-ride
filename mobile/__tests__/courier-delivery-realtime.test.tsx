import fs from "fs";
import path from "path";
import { act, renderHook, waitFor } from "@testing-library/react-native";

import { useCourierDeliveryRealtime } from "../hooks/useCourierDeliveryRealtime";
import { getCourierDelivery, getCourierDeliveryPin, getCourierEvents } from "../services/courierService";
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

jest.mock("../services/courierService", () => ({
  getCourierDelivery: jest.fn(),
  getCourierDeliveryPin: jest.fn(),
  getCourierEvents: jest.fn(),
}));

const delivery = (overrides: Record<string, unknown> = {}) => ({
  id: "delivery-1",
  realtime_version: 1,
  sender_user_id: "customer-1",
  status: "IN_TRANSIT",
  pickup_address: "Joina City, Harare",
  dropoff_address: "Borrowdale, Harare",
  recipient_name: "Tariro",
  recipient_phone: "+263770000001",
  package_type: "parcel",
  live_tracking_active: true,
  ...overrides,
}) as any;

const event = (version: number, payload: Record<string, unknown>, resourceId = "delivery-1"): RealtimeEventEnvelope => ({
  event_id: `event-${version}-${resourceId}`,
  type: "courier_delivery.location_updated",
  resource_type: "courier_delivery",
  resource_id: resourceId,
  version,
  occurred_at: "2027-01-01T10:00:00+00:00",
  payload: { realtime_version: version, ...payload },
});

describe("Courier delivery realtime migration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListener = null;
    mockRevision = 0;
    (getCourierDelivery as jest.Mock).mockResolvedValue(delivery());
    (getCourierEvents as jest.Mock).mockResolvedValue([]);
    (getCourierDeliveryPin as jest.Mock).mockResolvedValue({ delivery_id: "delivery-1", pin: "4821", verified: false });
  });

  it("loads one REST snapshot and history without interval polling", async () => {
    renderHook(() => useCourierDeliveryRealtime("delivery-1"));
    await waitFor(() => expect(getCourierDelivery).toHaveBeenCalledTimes(1));
    expect(getCourierEvents).toHaveBeenCalledTimes(1);
    expect(getCourierDelivery).toHaveBeenCalledTimes(1);

    const customerSource = fs.readFileSync(path.join(__dirname, "../app/(customer)/courier/[deliveryId].tsx"), "utf8");
    const courierSource = fs.readFileSync(path.join(__dirname, "../app/(courier)/delivery/[deliveryId].tsx"), "utf8");
    expect(customerSource).not.toContain("useLiveRefresh");
    expect(courierSource).not.toContain("useLiveRefresh");
    expect(courierSource).toContain("watchForegroundLocation");
    expect(courierSource).toContain("stopGps(false)");
    expect(courierSource).toContain("locationStarting.current === generation");
  });

  it("applies matching location/status events and ignores other or stale deliveries", async () => {
    const view = renderHook(() => useCourierDeliveryRealtime("delivery-1"));
    await waitFor(() => expect(view.result.current.delivery).not.toBeNull());
    act(() => mockListener?.(event(2, { last_courier_location: { latitude: -17.8, longitude: 31.05 } })));
    expect(view.result.current.delivery?.last_courier_location?.latitude).toBe(-17.8);
    act(() => mockListener?.(event(3, { status: "CANCELLED", live_tracking_active: false }, "delivery-2")));
    expect(view.result.current.delivery?.status).toBe("IN_TRANSIT");
    act(() => mockListener?.(event(1, { status: "CANCELLED" })));
    expect(view.result.current.delivery?.status).toBe("IN_TRANSIT");

    act(() => mockListener?.({ ...event(3, { status: "CANCELLED", live_tracking_active: false }), type: "courier_delivery.terminal" }));
    expect(view.result.current.delivery?.status).toBe("CANCELLED");
    expect(view.result.current.delivery?.live_tracking_active).toBe(false);
  });

  it("reconciles once for a version gap and once after resume", async () => {
    const view = renderHook(() => useCourierDeliveryRealtime("delivery-1"));
    await waitFor(() => expect(getCourierDelivery).toHaveBeenCalledTimes(1));
    (getCourierDelivery as jest.Mock).mockResolvedValue(delivery({ realtime_version: 3, remaining_eta_minutes: 6 }));
    act(() => mockListener?.(event(3, { remaining_eta_minutes: 6 })));
    act(() => mockListener?.(event(4, { remaining_eta_minutes: 5 })));
    await waitFor(() => expect(getCourierDelivery).toHaveBeenCalledTimes(2));

    mockRevision = 1;
    view.rerender(undefined);
    await waitFor(() => expect(getCourierDelivery).toHaveBeenCalledTimes(3));
  });

  it("fetches the customer PIN once when realtime first reaches eligibility", async () => {
    (getCourierDelivery as jest.Mock).mockResolvedValue(delivery({ status: "MATCHING", realtime_version: 1, live_tracking_active: false }));
    const view = renderHook(() => useCourierDeliveryRealtime("delivery-1", { includeHandoffPin: true }));
    await waitFor(() => expect(view.result.current.delivery?.status).toBe("MATCHING"));
    expect(getCourierDeliveryPin).not.toHaveBeenCalled();
    act(() => mockListener?.({ ...event(2, { status: "PICKED_UP" }), type: "courier_delivery.status_changed" }));
    await waitFor(() => expect(getCourierDeliveryPin).toHaveBeenCalledTimes(1));
    act(() => mockListener?.(event(3, { last_courier_location: { latitude: -17.8, longitude: 31.05 } })));
    expect(getCourierDeliveryPin).toHaveBeenCalledTimes(1);
  });

  it("applies realtime admin cancellation and never resurrects terminal UI", async () => {
    const view = renderHook(() => useCourierDeliveryRealtime("delivery-1"));
    await waitFor(() => expect(view.result.current.delivery).not.toBeNull());
    act(() => mockListener?.({ ...event(2, { status: "CANCELLED", live_tracking_active: false }), type: "courier_delivery.terminal" }));
    expect(view.result.current.delivery?.status).toBe("CANCELLED");
    (getCourierDelivery as jest.Mock).mockResolvedValue(delivery({ realtime_version: 3, status: "IN_TRANSIT" }));
    act(() => mockListener?.({ ...event(3, { status: "IN_TRANSIT" }), type: "courier_delivery.status_changed" }));
    await waitFor(() => expect(getCourierDelivery).toHaveBeenCalledTimes(2));
    expect(view.result.current.delivery?.status).toBe("CANCELLED");
  });
});
