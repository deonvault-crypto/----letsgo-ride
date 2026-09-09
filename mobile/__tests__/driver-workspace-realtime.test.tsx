import fs from "fs";
import path from "path";
import type { PropsWithChildren } from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";

import { DriverWorkspaceProvider, useDriverWorkspace } from "../contexts/DriverWorkspaceContext";
import { getDriverWorkspace } from "../services/ridesService";
import type { RealtimeEventEnvelope } from "../types/realtime.types";
import type { Ride, RideRequest } from "../types/ride.types";


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

jest.mock("../contexts/SessionContext", () => ({
  useSession: () => ({ user: { id: "driver-1", role: "driver", name: "Driver" } }),
}));

jest.mock("../services/ridesService", () => ({ getDriverWorkspace: jest.fn() }));

const ride = (id = "ride-1", version = 1, overrides: Partial<Ride> = {}): Ride => ({
  id,
  realtime_version: version,
  driver_id: "profile-1",
  driver_user_id: "driver-1",
  driver_name: "Driver",
  vehicle: "Toyota, silver",
  origin: "Harare",
  destination: "Bulawayo",
  pickup_note: "Joina City",
  dropoff_note: "City Hall",
  date: "2027-01-01",
  time: "10:00",
  price_usd: 12,
  available_seats: 3,
  status: "SCHEDULED",
  ...overrides,
});

const request = (id = "request-1", version = 1, overrides: Partial<RideRequest> = {}): RideRequest => ({
  id,
  realtime_version: version,
  ride_id: "ride-1",
  user_id: "passenger-1",
  passenger_name: "Passenger",
  passenger_note: "One bag",
  seats: 1,
  status: "pending",
  ride_snapshot: ride(),
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

const rideEvent = (type: string, item: Ride) => event(type, "ride", item.id, item.realtime_version || 0, item as unknown as Record<string, unknown>);
const requestEvent = (type: string, item: RideRequest) => event(type, "ride_request", item.id, item.realtime_version || 0, item as unknown as Record<string, unknown>);
const wrapper = ({ children }: PropsWithChildren) => <DriverWorkspaceProvider>{children}</DriverWorkspaceProvider>;

describe("Driver workspace realtime", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListener = null;
    mockRevision = 0;
    (getDriverWorkspace as jest.Mock).mockResolvedValue({ rides: [ride()], requests: [request()] });
  });

  it("loads one shared snapshot and removes Driver Home and Trips timer polling", async () => {
    renderHook(() => useDriverWorkspace(), { wrapper });
    await waitFor(() => expect(getDriverWorkspace).toHaveBeenCalledTimes(1));
    const workspace = fs.readFileSync(path.join(__dirname, "../contexts/DriverWorkspaceContext.tsx"), "utf8");
    const home = fs.readFileSync(path.join(__dirname, "../app/(driver)/home.tsx"), "utf8");
    const trips = fs.readFileSync(path.join(__dirname, "../app/(driver)/trips.tsx"), "utf8");
    expect(workspace).toContain("getDriverWorkspace");
    expect(workspace).toContain("requests");
    expect(workspace).toContain("subscribe");
    expect(home).not.toContain("useLiveRefresh");
    expect(trips).not.toContain("useLiveRefresh");
    expect(trips).toContain("useDriverWorkspace");
    expect(trips).not.toContain("useDriverRides");
  });

  it("inserts Ride and Request events once and derives stable metrics", async () => {
    const view = renderHook(() => useDriverWorkspace(), { wrapper });
    await waitFor(() => expect(view.result.current.rides).toHaveLength(1));
    act(() => mockListener?.(rideEvent("ride.created", ride("ride-2"))));
    act(() => mockListener?.(rideEvent("ride.created", ride("ride-2"))));
    act(() => mockListener?.(requestEvent("ride_request.created", request("request-2", 1, { ride_id: "ride-2" }))));
    expect(view.result.current.rides).toHaveLength(2);
    expect(view.result.current.requests).toHaveLength(2);
    expect(view.result.current.rides.filter((item) => !["COMPLETED", "CANCELLED", "EXPIRED"].includes(item.status)).length).toBe(2);
    expect(view.result.current.requests.filter((item) => item.status === "pending")).toHaveLength(2);
  });

  it("applies updates while ignoring duplicate and stale versions", async () => {
    const view = renderHook(() => useDriverWorkspace(), { wrapper });
    await waitFor(() => expect(view.result.current.rides).toHaveLength(1));
    act(() => mockListener?.(rideEvent("ride.updated", ride("ride-1", 2, { available_seats: 2 }))));
    expect(view.result.current.rides[0].available_seats).toBe(2);
    act(() => mockListener?.(rideEvent("ride.updated", ride("ride-1", 2, { available_seats: 1 }))));
    act(() => mockListener?.(rideEvent("ride.updated", ride("ride-1", 1, { available_seats: 0 }))));
    expect(view.result.current.rides[0].available_seats).toBe(2);
    act(() => mockListener?.(requestEvent("ride_request.updated", request("request-1", 2, { status: "confirmed" }))));
    expect(view.result.current.requests[0].status).toBe("confirmed");
  });

  it("performs one reconciliation for a version gap and once after reconnect", async () => {
    const view = renderHook(() => useDriverWorkspace(), { wrapper });
    await waitFor(() => expect(getDriverWorkspace).toHaveBeenCalledTimes(1));
    (getDriverWorkspace as jest.Mock).mockResolvedValue({ rides: [ride("ride-1", 3, { available_seats: 1 })], requests: [request()] });
    act(() => mockListener?.(rideEvent("ride.updated", ride("ride-1", 3, { available_seats: 1 }))));
    act(() => mockListener?.(rideEvent("ride.updated", ride("ride-1", 3, { available_seats: 1 }))));
    await waitFor(() => expect(getDriverWorkspace).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(view.result.current.rides[0].available_seats).toBe(1));
    mockRevision = 1;
    view.rerender(undefined);
    await waitFor(() => expect(getDriverWorkspace).toHaveBeenCalledTimes(3));
  });

  it("publishes REST mutation responses into shared Home and Trips state without refetch", async () => {
    const first = renderHook(() => useDriverWorkspace(), { wrapper });
    await waitFor(() => expect(first.result.current.rides).toHaveLength(1));
    act(() => first.result.current.upsertRide(ride("ride-1", 2, { status: "IN_PROGRESS" })));
    act(() => first.result.current.upsertRequest(request("request-1", 2, { status: "confirmed" })));
    expect(first.result.current.rides[0].status).toBe("IN_PROGRESS");
    expect(first.result.current.requests[0].status).toBe("confirmed");
    expect(getDriverWorkspace).toHaveBeenCalledTimes(1);
    const detail = fs.readFileSync(path.join(__dirname, "../app/(driver)/trip/[id].tsx"), "utf8");
    expect(detail).not.toContain("driverRideRequests");
    expect(detail).not.toContain("await load()");
    expect(detail).toContain("upsertRequest");
    expect(detail).toContain("upsertRide");
  });
});
