import { act, renderHook, waitFor } from "@testing-library/react-native";

import { useRides } from "../hooks/useRides";
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
    jest.useFakeTimers();
    (searchRides as jest.Mock).mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("keeps existing rides visible during background refresh instead of flashing a spinner", async () => {
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

    act(() => {
      jest.advanceTimersByTime(15000);
    });

    expect(listRides).toHaveBeenCalledTimes(2);
    expect(result.current.loading).toBe(false);
    expect(result.current.rides).toEqual([ride]);

    await act(async () => {
      finishRefresh([{ ...ride, id: "ride-2", destination: "Mutare" }]);
      await refreshPromise;
    });

    expect(result.current.rides[0].destination).toBe("Mutare");
  });
});
