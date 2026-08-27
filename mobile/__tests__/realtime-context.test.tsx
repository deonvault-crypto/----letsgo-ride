import { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AppState, AppStateStatus } from "react-native";

import { RealtimeProvider, useRealtime } from "../contexts/RealtimeContext";
import { realtimeService } from "../services/realtimeService";
import { passengerUser } from "./fixtures";

let mockPathname = "/home";
jest.mock("expo-router", () => ({ usePathname: () => mockPathname }));


let mockSessionState: { user: typeof passengerUser | null; loading: boolean; isGuest: boolean; invalidateSession: jest.Mock };
let mockAuthenticationFailure: (() => void) | null = null;

jest.mock("../contexts/SessionContext", () => ({
  useSession: () => mockSessionState,
}));

jest.mock("../services/sessionLifecycle", () => ({
  onSessionCleared: jest.fn(() => jest.fn()),
}));

jest.mock("../services/realtimeService", () => ({
  realtimeService: {
    connectionState: "idle",
    onStateChange: jest.fn((listener) => { listener("idle"); return jest.fn(); }),
    onReconciliationNeeded: jest.fn(() => jest.fn()),
    onAuthenticationFailure: jest.fn((listener) => { mockAuthenticationFailure = listener; return jest.fn(); }),
    onEvent: jest.fn(() => jest.fn()),
    start: jest.fn(async () => undefined),
    stop: jest.fn(),
    suspend: jest.fn(),
    resume: jest.fn(async () => undefined),
    reconnect: jest.fn(),
  },
}));

describe("RealtimeProvider lifecycle", () => {
  let currentState: AppStateStatus;
  let appStateListener: (state: AppStateStatus) => void;
  const wrapper = ({ children }: { children: ReactNode }) => <RealtimeProvider>{children}</RealtimeProvider>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthenticationFailure = null;
    mockPathname = "/home";
    mockSessionState = { user: passengerUser, loading: false, isGuest: false, invalidateSession: jest.fn(async () => undefined) };
    currentState = "active";
    Object.defineProperty(AppState, "currentState", { configurable: true, get: () => currentState });
    jest.spyOn(AppState, "addEventListener").mockImplementation((_, listener) => {
      appStateListener = listener;
      return { remove: jest.fn() } as never;
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it("connects for an authenticated session and reconnects for a role change", async () => {
    const view = renderHook(() => useRealtime(), { wrapper });
    await waitFor(() => expect(realtimeService.start).toHaveBeenCalledWith(`${passengerUser.id}:passenger`));

    mockSessionState = { ...mockSessionState, user: { ...passengerUser, role: "driver" } };
    view.rerender(undefined);
    await waitFor(() => expect(realtimeService.start).toHaveBeenLastCalledWith(`${passengerUser.id}:driver`));
    expect(realtimeService.stop).toHaveBeenCalled();
  });

  it("keeps the authenticated socket alive across ordinary navigation", async () => {
    const view = renderHook(() => useRealtime(), { wrapper });
    await waitFor(() => expect(realtimeService.start).toHaveBeenCalledTimes(1));

    mockPathname = "/account";
    view.rerender(undefined);

    expect(realtimeService.start).toHaveBeenCalledTimes(1);
    expect(realtimeService.stop).not.toHaveBeenCalled();
  });

  it("does not connect for a guest and disconnects after logout", async () => {
    mockSessionState = { user: null, loading: false, isGuest: true, invalidateSession: jest.fn(async () => undefined) };
    const view = renderHook(() => useRealtime(), { wrapper });
    expect(realtimeService.start).not.toHaveBeenCalled();
    expect(realtimeService.stop).toHaveBeenCalled();

    mockSessionState = { ...mockSessionState, user: passengerUser, loading: false, isGuest: false };
    view.rerender(undefined);
    await waitFor(() => expect(realtimeService.start).toHaveBeenCalled());
    mockSessionState = { ...mockSessionState, user: null, loading: false, isGuest: true };
    view.rerender(undefined);
    await waitFor(() => expect(realtimeService.stop).toHaveBeenCalled());
  });

  it("suspends in background and resumes when active", async () => {
    renderHook(() => useRealtime(), { wrapper });
    await waitFor(() => expect(realtimeService.start).toHaveBeenCalled());
    currentState = "background";
    act(() => appStateListener("background"));
    expect(realtimeService.suspend).toHaveBeenCalledTimes(1);
    currentState = "active";
    act(() => appStateListener("active"));
    expect(realtimeService.resume).toHaveBeenCalledTimes(1);
  });

  it("invalidates the session when the server rejects socket authentication", async () => {
    renderHook(() => useRealtime(), { wrapper });
    await waitFor(() => expect(mockAuthenticationFailure).not.toBeNull());
    act(() => mockAuthenticationFailure?.());
    expect(mockSessionState.invalidateSession).toHaveBeenCalledTimes(1);
  });
});
