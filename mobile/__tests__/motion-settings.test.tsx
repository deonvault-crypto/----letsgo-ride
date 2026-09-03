import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo, AppState, AppStateStatus } from "react-native";

import { useMotionSettings } from "../hooks/useMotionSettings";

describe("system motion preferences", () => {
  let onMotion: (enabled: boolean) => void;
  let onState: (state: AppStateStatus) => void;
  const removeMotion = jest.fn();
  const removeState = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    AppState.currentState = "active";
    jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation((_: string, callback: unknown) => {
      onMotion = callback as (enabled: boolean) => void;
      return { remove: removeMotion } as unknown as ReturnType<typeof AccessibilityInfo.addEventListener>;
    });
    jest.spyOn(AppState, "addEventListener").mockImplementation((_, callback) => {
      onState = callback;
      return { remove: removeState };
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it("stays still while loading preferences and shares native listeners across consumers", async () => {
    let resolve!: (value: boolean) => void;
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockReturnValue(new Promise((done) => { resolve = done; }));
    const first = renderHook(useMotionSettings);
    const second = renderHook(useMotionSettings);
    expect(first.result.current.canAnimate).toBe(false);
    expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalledTimes(1);
    expect(AccessibilityInfo.addEventListener).toHaveBeenCalledTimes(1);
    await act(async () => resolve(false));
    expect(first.result.current.canAnimate).toBe(true);
    act(() => onState("background"));
    expect(second.result.current.canAnimate).toBe(false);
    act(() => onState("active"));
    expect(second.result.current.canAnimate).toBe(true);
    act(() => onMotion(true));
    expect(first.result.current.canAnimate).toBe(false);
    first.unmount();
    expect(removeMotion).not.toHaveBeenCalled();
    second.unmount();
    expect(removeMotion).toHaveBeenCalledTimes(1);
    expect(removeState).toHaveBeenCalledTimes(1);
  });

  it("does not overwrite a new system preference with a late initial response", async () => {
    let resolve!: (value: boolean) => void;
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockReturnValue(new Promise((done) => { resolve = done; }));
    const view = renderHook(useMotionSettings);
    act(() => onMotion(true));
    await act(async () => resolve(false));
    expect(view.result.current.reduceMotion).toBe(true);
    view.unmount();
  });

  it("keeps the readable static fallback if the native preference query fails", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockRejectedValue(new Error("Unavailable"));
    const view = renderHook(useMotionSettings);
    await waitFor(() => expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalled());
    expect(view.result.current.canAnimate).toBe(false);
    view.unmount();
  });
});
