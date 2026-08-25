import fs from "fs";
import path from "path";
import { act, renderHook, waitFor } from "@testing-library/react-native";

import { useTrips } from "../hooks/useTrips";
import { myRideRequests } from "../services/ridesService";
import type { RealtimeEventEnvelope } from "../types/realtime.types";
import type { RideRequest } from "../types/ride.types";
import { ride, rideRequest } from "./fixtures";


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

jest.mock("../services/ridesService", () => ({ myRideRequests: jest.fn() }));

const request = (version = 1, overrides: Partial<RideRequest> = {}): RideRequest => ({
  ...rideRequest,
  user_id: "user-passenger",
  realtime_version: version,
  ride_snapshot: { ...ride, realtime_version: 1, status: "SCHEDULED" },
  ...overrides,
});

const event = (
  type: string,
  resourceType: string,
  resourceId: string,
  version: number,
  payload: Record<string, unknown>,
): RealtimeEventEnvelope => ({
  event_id: `${type}-${resourceId}-${version}`,
  type,
  resource_type: resourceType,
  resource_id: resourceId,
  version,
  occurred_at: "2027-01-01T10:00:00+00:00",
  payload: { ...payload, realtime_version: version },
});

describe("Passenger Ride requests realtime", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListener = null;
    mockRevision = 0;
    (myRideRequests as jest.Mock).mockResolvedValue([request()]);
  });

  it("loads once and removes the passenger booking timer", async () => {
    renderHook(() => useTrips());
    await waitFor(() => expect(myRideRequests).toHaveBeenCalledTimes(1));
    const source = fs.readFileSync(path.join(__dirname, "../hooks/useTrips.ts"), "utf8");
    expect(source).not.toContain("useLiveRefresh");
    expect(source).toContain("ride_request");
    expect(source).toContain("resource_type !== \"ride\"");
  });

  it("applies acceptance and Ride lifecycle events without refetching", async () => {
    const view = renderHook(() => useTrips());
    await waitFor(() => expect(view.result.current.trips).toHaveLength(1));
    act(() => mockListener?.(event(
      "ride_request.updated", "ride_request", rideRequest.id, 2,
      request(2, { status: "confirmed" }) as unknown as Record<string, unknown>,
    )));
    expect(view.result.current.trips[0].status).toBe("confirmed");
    act(() => mockListener?.(event(
      "ride.status_changed", "ride", ride.id, 2,
      { id: ride.id, status: "IN_PROGRESS", live_tracking_active: true, available_seats: 2 },
    )));
    expect(view.result.current.trips[0].ride_snapshot?.status).toBe("IN_PROGRESS");
    expect(view.result.current.trips[0].ride_snapshot?.live_tracking_active).toBe(true);
    expect(myRideRequests).toHaveBeenCalledTimes(1);
  });

  it("ignores stale events and reconciles one version gap and reconnect", async () => {
    const view = renderHook(() => useTrips());
    await waitFor(() => expect(view.result.current.trips).toHaveLength(1));
    act(() => mockListener?.(event(
      "ride_request.updated", "ride_request", rideRequest.id, 1,
      request(1, { status: "declined" }) as unknown as Record<string, unknown>,
    )));
    expect(view.result.current.trips[0].status).toBe("pending");
    (myRideRequests as jest.Mock).mockResolvedValue([request(3, { status: "confirmed" })]);
    act(() => mockListener?.(event(
      "ride_request.updated", "ride_request", rideRequest.id, 3,
      request(3, { status: "confirmed" }) as unknown as Record<string, unknown>,
    )));
    act(() => mockListener?.(event(
      "ride_request.updated", "ride_request", rideRequest.id, 3,
      request(3, { status: "confirmed" }) as unknown as Record<string, unknown>,
    )));
    await waitFor(() => expect(myRideRequests).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(view.result.current.trips[0].status).toBe("confirmed"));
    mockRevision = 1;
    view.rerender(undefined);
    await waitFor(() => expect(myRideRequests).toHaveBeenCalledTimes(3));
  });

  it("applies cancel/check-in REST truth locally without a list reload", async () => {
    const view = renderHook(() => useTrips());
    await waitFor(() => expect(view.result.current.trips).toHaveLength(1));
    act(() => view.result.current.upsertTrip(request(2, { status: "confirmed", checked_in: true })));
    expect(view.result.current.trips[0].checked_in).toBe(true);
    expect(myRideRequests).toHaveBeenCalledTimes(1);
    const screen = fs.readFileSync(path.join(__dirname, "../app/(customer)/my-trips.tsx"), "utf8");
    expect(screen).not.toContain("await reload()");
    expect(screen).toContain("upsertTrip(await cancelMyRideRequest");
    expect(screen).toContain("upsertTrip(await checkInRideRequest");
  });
});
