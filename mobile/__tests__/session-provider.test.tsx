import { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AppState, AppStateStatus } from "react-native";

import { SessionProvider, useSession } from "../contexts/SessionContext";
import { getCurrentUser, hasSession } from "../services/authService";
import { publishSessionUser } from "../services/sessionLifecycle";
import { passengerUser } from "./fixtures";

jest.mock("../services/authService", () => ({
  getCurrentUser: jest.fn(),
  hasSession: jest.fn(),
  logout: jest.fn(),
}));

describe("SessionProvider", () => {
  let currentState: AppStateStatus;
  let appStateListener: (state: AppStateStatus) => void;

  beforeEach(() => {
    jest.clearAllMocks();
    currentState = "active";
    Object.defineProperty(AppState, "currentState", { configurable: true, get: () => currentState });
    jest.spyOn(AppState, "addEventListener").mockImplementation((_, listener) => {
      appStateListener = listener;
      return { remove: jest.fn() } as never;
    });
  });

  afterEach(() => jest.restoreAllMocks());

  const wrapper = ({ children }: { children: ReactNode }) => <SessionProvider>{children}</SessionProvider>;

  it("hydrates an authenticated session once and refreshes once on foreground resume", async () => {
    (hasSession as jest.Mock).mockResolvedValue(true);
    (getCurrentUser as jest.Mock).mockResolvedValue(passengerUser);
    const { result } = renderHook(() => useSession(), { wrapper });

    await waitFor(() => expect(result.current.user).toEqual(passengerUser));
    expect(getCurrentUser).toHaveBeenCalledTimes(1);

    currentState = "background";
    act(() => appStateListener("background"));
    currentState = "active";
    act(() => appStateListener("active"));
    await waitFor(() => expect(getCurrentUser).toHaveBeenCalledTimes(2));
  });

  it("preserves guest mode without calling auth/me", async () => {
    (hasSession as jest.Mock).mockResolvedValue(false);
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.isGuest).toBe(true));
    expect(result.current.user).toBeNull();
    expect(getCurrentUser).not.toHaveBeenCalled();
  });

  it("accepts mutation results without another auth/me request", async () => {
    (hasSession as jest.Mock).mockResolvedValue(true);
    (getCurrentUser as jest.Mock).mockResolvedValue(passengerUser);
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.user).toEqual(passengerUser));

    const updated = { ...passengerUser, name: "Updated Name" };
    act(() => publishSessionUser(updated));
    expect(result.current.user).toEqual(updated);
    expect(getCurrentUser).toHaveBeenCalledTimes(1);
  });

  it("does not let an older session response overwrite a newer login", async () => {
    let resolveOldUser: (user: typeof passengerUser) => void = () => undefined;
    const oldRequest = new Promise<typeof passengerUser>((resolve) => { resolveOldUser = resolve; });
    (hasSession as jest.Mock).mockResolvedValue(true);
    (getCurrentUser as jest.Mock).mockReturnValue(oldRequest);
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(getCurrentUser).toHaveBeenCalledTimes(1));

    const newerUser = { ...passengerUser, id: "new-session-user", name: "New Session" };
    act(() => publishSessionUser(newerUser));
    await act(async () => {
      resolveOldUser(passengerUser);
      await oldRequest;
    });

    expect(result.current.user).toEqual(newerUser);
  });
});
