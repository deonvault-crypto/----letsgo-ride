import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import * as Location from "expo-location";
import { AppState, AppStateStatus } from "react-native";

import { LiveTripPanel } from "../components/trips/LiveTripPanel";
import { updateLiveTripLocation } from "../services/ridesService";
import { ride } from "./fixtures";

jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = require("react");
    React.useEffect(() => callback(), [callback]);
  },
}));

jest.mock("../services/ridesService", () => ({
  disableLiveTripLocation: jest.fn(),
  endTrip: jest.fn(),
  getLiveTripState: jest.fn(),
  updateLiveTripLocation: jest.fn(),
}));

describe("driver live-location lifecycle", () => {
  it("stops the foreground watcher in background and re-establishes it on resume", async () => {
    let currentState: AppStateStatus = "active";
    let appStateListener: (state: AppStateStatus) => void = () => undefined;
    const firstRemove = jest.fn();
    const secondRemove = jest.fn();
    Object.defineProperty(AppState, "currentState", { configurable: true, get: () => currentState });
    jest.spyOn(AppState, "addEventListener").mockImplementation((_, listener) => {
      appStateListener = listener;
      return { remove: jest.fn() } as never;
    });
    (Location.watchPositionAsync as jest.Mock)
      .mockResolvedValueOnce({ remove: firstRemove })
      .mockResolvedValueOnce({ remove: secondRemove });
    (updateLiveTripLocation as jest.Mock).mockResolvedValue({ live_tracking_enabled: true });

    const screen = render(<LiveTripPanel ride={{ ...ride, status: "IN_PROGRESS" }} role="driver" />);
    fireEvent.press(screen.getByText("Share live location"));
    await waitFor(() => expect(Location.watchPositionAsync).toHaveBeenCalledTimes(1));

    currentState = "background";
    act(() => appStateListener("background"));
    expect(firstRemove).toHaveBeenCalledTimes(1);

    currentState = "active";
    act(() => appStateListener("active"));
    await waitFor(() => expect(Location.watchPositionAsync).toHaveBeenCalledTimes(2));
  });
});
