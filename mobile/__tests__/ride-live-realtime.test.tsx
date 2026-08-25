import fs from "fs";
import path from "path";
import { act, renderHook, waitFor } from "@testing-library/react-native";

import { useRideLiveRealtime } from "../hooks/useRideLiveRealtime";
import { getLiveTripState } from "../services/ridesService";
import type { RealtimeEventEnvelope } from "../types/realtime.types";
import { ride } from "./fixtures";


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

jest.mock("../services/ridesService", () => ({ getLiveTripState: jest.fn() }));

const state = (version = 1, overrides: Record<string, unknown> = {}) => ({
  ride_id: ride.id,
  realtime_version: version,
  status: "IN_PROGRESS",
  live_tracking_enabled: true,
  last_driver_location: { latitude: -17.8318, longitude: 31.0460, updated_at: "2027-01-01T10:00:00+00:00" },
  origin: ride.origin,
  destination: ride.destination,
  ...overrides,
});

const event = (resourceId: string, version: number, payload: Record<string, unknown>, type = "ride.location_updated"): RealtimeEventEnvelope => ({
  event_id: `${type}-${resourceId}-${version}`,
  type,
  resource_type: "ride",
  resource_id: resourceId,
  version,
  occurred_at: "2027-01-01T10:00:00+00:00",
  payload: { ...payload, realtime_version: version },
});

describe("passenger live Ride realtime", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListener = null;
    mockRevision = 0;
    (getLiveTripState as jest.Mock).mockResolvedValue(state());
  });

  it("loads one live snapshot and has no 15-second polling", async () => {
    renderHook(() => useRideLiveRealtime({ ...ride, realtime_version: 1 }, true));
    await waitFor(() => expect(getLiveTripState).toHaveBeenCalledTimes(1));
    const panel = fs.readFileSync(path.join(__dirname, "../components/trips/LiveTripPanel.tsx"), "utf8");
    expect(panel).not.toContain("useLiveRefresh");
    expect(panel).not.toContain("15000");
    expect(panel).toContain("watchPositionAsync");
    expect(panel).toContain("timeInterval: 20000");
    expect(panel).toContain("distanceInterval: 100");
  });

  it("applies matching location events and ignores unrelated or stale events", async () => {
    const view = renderHook(() => useRideLiveRealtime({ ...ride, realtime_version: 1 }, true));
    await waitFor(() => expect(view.result.current.state).not.toBeNull());
    act(() => mockListener?.(event("other-ride", 2, { status: "IN_PROGRESS" })));
    expect(view.result.current.state?.last_driver_location?.latitude).toBe(-17.8318);
    act(() => mockListener?.(event(ride.id, 2, {
      status: "IN_PROGRESS",
      live_tracking_active: true,
      last_driver_location: { latitude: -17.8, longitude: 31.1, updated_at: "2027-01-01T10:01:00+00:00" },
    })));
    expect(view.result.current.state?.last_driver_location?.latitude).toBe(-17.8);
    act(() => mockListener?.(event(ride.id, 1, { status: "IN_PROGRESS", last_driver_location: null })));
    expect(view.result.current.state?.last_driver_location?.latitude).toBe(-17.8);
  });

  it("reconciles one gap, one reconnect, and keeps terminal state final", async () => {
    const view = renderHook(() => useRideLiveRealtime({ ...ride, realtime_version: 1 }, true));
    await waitFor(() => expect(getLiveTripState).toHaveBeenCalledTimes(1));
    (getLiveTripState as jest.Mock).mockResolvedValue(state(3, { last_driver_location: null }));
    act(() => mockListener?.(event(ride.id, 3, { status: "IN_PROGRESS", last_driver_location: null })));
    act(() => mockListener?.(event(ride.id, 3, { status: "IN_PROGRESS", last_driver_location: null })));
    await waitFor(() => expect(getLiveTripState).toHaveBeenCalledTimes(2));
    act(() => mockListener?.(event(ride.id, 4, { status: "COMPLETED", live_tracking_active: false }, "ride.terminal")));
    expect(view.result.current.state?.status).toBe("COMPLETED");
    expect(view.result.current.state?.live_tracking_enabled).toBe(false);
    (getLiveTripState as jest.Mock).mockResolvedValue(state(5, { status: "COMPLETED", live_tracking_enabled: false, last_driver_location: null }));
    act(() => mockListener?.(event(ride.id, 5, { status: "IN_PROGRESS", live_tracking_active: true }, "ride.status_changed")));
    await waitFor(() => expect(getLiveTripState).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(view.result.current.state?.status).toBe("COMPLETED"));
    mockRevision = 1;
    view.rerender(undefined);
    await waitFor(() => expect(getLiveTripState).toHaveBeenCalledTimes(4));
  });
});
