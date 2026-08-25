import { act, renderHook } from "@testing-library/react-native";
import { AppState, AppStateStatus } from "react-native";

import { useScreenReconciliation } from "../hooks/useScreenReconciliation";

jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = require("react");
    React.useEffect(() => callback(), [callback]);
  },
}));

describe("screen reconciliation", () => {
  let currentState: AppStateStatus;
  let listener: (state: AppStateStatus) => void;

  beforeEach(() => {
    jest.useFakeTimers();
    currentState = "active";
    Object.defineProperty(AppState, "currentState", { configurable: true, get: () => currentState });
    jest.spyOn(AppState, "addEventListener").mockImplementation((_, callback) => {
      listener = callback;
      return { remove: jest.fn() } as never;
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("loads once, never schedules a timer, and reconciles once on resume", async () => {
    const refresh = jest.fn().mockResolvedValue(undefined);
    const intervalSpy = jest.spyOn(global, "setInterval");
    renderHook(() => useScreenReconciliation(refresh));
    await act(async () => undefined);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(intervalSpy).not.toHaveBeenCalled();

    currentState = "background";
    act(() => listener("background"));
    act(() => jest.advanceTimersByTime(60000));
    expect(refresh).toHaveBeenCalledTimes(1);

    currentState = "active";
    act(() => listener("active"));
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("does not load when disabled", () => {
    const refresh = jest.fn();
    renderHook(() => useScreenReconciliation(refresh, false));
    expect(refresh).not.toHaveBeenCalled();
  });
});
