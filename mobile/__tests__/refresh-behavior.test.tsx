import { act, renderHook, waitFor } from "@testing-library/react-native";

import { clearRideDiscoveryCache, useRides } from "../hooks/useRides";
import { listRides, searchRides } from "../services/ridesService";
import { Ride } from "../types/ride.types";
import { ride } from "./fixtures";

jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = require("react");
    React.useEffect(() => callback(), [callback]);
  },
}));

jest.mock("../services/ridesService", () => ({
  listRides: jest.fn(),
  searchRides: jest.fn(),
}));

describe("live refresh behavior", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearRideDiscoveryCache();
    jest.useFakeTimers();
    (searchRides as jest.Mock).mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("keeps existing rides visible during manual reconciliation without a timer", async () => {
    let finishRefresh: (value: Ride[]) => void = () => undefined;
    const refreshPromise = new Promise<Ride[]>((resolve) => {
      finishRefresh = resolve;
    });

    (listRides as jest.Mock)
      .mockResolvedValueOnce([ride])
      .mockReturnValueOnce(refreshPromise);

    const { result } = renderHook(() => useRides());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.rides).toEqual([ride]);
    });

    act(() => { jest.advanceTimersByTime(60000); });
    expect(listRides).toHaveBeenCalledTimes(1);

    act(() => { void result.current.reload(); });

    expect(listRides).toHaveBeenCalledTimes(2);
    expect(result.current.loading).toBe(false);
    expect(result.current.rides).toEqual([ride]);

    await act(async () => {
      finishRefresh([{ ...ride, id: "ride-2", destination: "Mutare" }]);
      await refreshPromise;
    });

    expect(result.current.rides[0].destination).toBe("Mutare");
  });

  it("deduplicates simultaneous opening requests for the same discovery key", async () => {
    let resolveRequest: (value: Ride[]) => void = () => undefined;
    const pending = new Promise<Ride[]>((resolve) => { resolveRequest = resolve; });
    (listRides as jest.Mock).mockReturnValue(pending);

    const { result } = renderHook(() => ({ first: useRides(), second: useRides() }));
    await waitFor(() => expect(listRides).toHaveBeenCalledTimes(1));
    await act(async () => { resolveRequest([ride]); await pending; });
    expect(result.current.first.rides).toEqual([ride]);
    expect(result.current.second.rides).toEqual([ride]);
  });

  it("preserves the successful snapshot when a background refresh fails", async () => {
    (listRides as jest.Mock).mockResolvedValueOnce([ride]).mockRejectedValueOnce(new Error("Temporary network issue"));
    const { result } = renderHook(() => useRides());
    await waitFor(() => expect(result.current.rides).toEqual([ride]));

    await act(async () => { await result.current.reload(); });
    expect(result.current.rides).toEqual([ride]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe("Temporary network issue");
  });

  it("settles an empty first result without scheduling another request", async () => {
    (listRides as jest.Mock).mockResolvedValue([]);
    const { result } = renderHook(() => useRides());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => { jest.advanceTimersByTime(90000); });
    expect(result.current.rides).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(listRides).toHaveBeenCalledTimes(1);
  });

  it("bounds discovery snapshots instead of retaining every searched route", async () => {
    (searchRides as jest.Mock).mockResolvedValue([ride]);

    for (let index = 0; index < 9; index += 1) {
      const view = renderHook(() => useRides({ origin: `Origin ${index}`, destination: `Destination ${index}`, seats: 1 }));
      await waitFor(() => expect(view.result.current.loading).toBe(false));
      view.unmount();
    }

    const firstAgain = renderHook(() => useRides({ origin: "Origin 0", destination: "Destination 0", seats: 1 }));
    await waitFor(() => expect(firstAgain.result.current.loading).toBe(false));
    expect(searchRides).toHaveBeenCalledTimes(10);
  });
});
