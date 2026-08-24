import { act, renderHook } from "@testing-library/react-native";
import { AppState, AppStateStatus } from "react-native";

import { useLiveRefresh } from "../hooks/useLiveRefresh";

jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = require("react");
    React.useEffect(() => callback(), [callback]);
  },
}));

describe("useLiveRefresh lifecycle", () => {
  let currentState: AppStateStatus;
  let appStateListener: (state: AppStateStatus) => void;
  const remove = jest.fn();

  beforeEach(() => {
    jest.useFakeTimers();
    currentState = "active";
    Object.defineProperty(AppState, "currentState", { configurable: true, get: () => currentState });
    jest.spyOn(AppState, "addEventListener").mockImplementation((_, listener) => {
      appStateListener = listener;
      return { remove } as never;
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    remove.mockReset();
  });

  it("skips interval ticks while a refresh is in flight", async () => {
    let finish: () => void = () => undefined;
    const first = new Promise<void>((resolve) => { finish = resolve; });
    const refresh = jest.fn().mockReturnValueOnce(first).mockResolvedValue(undefined);
    renderHook(() => useLiveRefresh(refresh, 1000));

    expect(refresh).toHaveBeenCalledTimes(1);
    act(() => { jest.advanceTimersByTime(3000); });
    expect(refresh).toHaveBeenCalledTimes(1);

    await act(async () => { finish(); await first; });
    act(() => { jest.advanceTimersByTime(1000); });
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("does not refresh while backgrounded and reconciles once on resume", async () => {
    const refresh = jest.fn().mockResolvedValue(undefined);
    renderHook(() => useLiveRefresh(refresh, 1000));
    await act(async () => undefined);

    currentState = "background";
    act(() => appStateListener("background"));
    act(() => { jest.advanceTimersByTime(3000); });
    expect(refresh).toHaveBeenCalledTimes(1);

    currentState = "active";
    act(() => appStateListener("active"));
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("clears its timer and listener on unmount", async () => {
    const refresh = jest.fn().mockResolvedValue(undefined);
    const view = renderHook(() => useLiveRefresh(refresh, 1000));
    await act(async () => undefined);
    view.unmount();
    act(() => { jest.advanceTimersByTime(3000); });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalled();
  });

  it("performs no refresh when disabled", () => {
    const refresh = jest.fn();
    const listenerCalls = (AppState.addEventListener as jest.Mock).mock.calls.length;
    renderHook(() => useLiveRefresh(refresh, 1000, false));
    act(() => { jest.advanceTimersByTime(3000); });
    expect(refresh).not.toHaveBeenCalled();
    expect(AppState.addEventListener).toHaveBeenCalledTimes(listenerCalls);
  });
});
