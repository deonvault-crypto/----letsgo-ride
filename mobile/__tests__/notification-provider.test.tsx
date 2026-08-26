import { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AppState, AppStateStatus } from "react-native";

import { NotificationProvider, useNotifications } from "../contexts/NotificationContext";
import { listNotifications } from "../services/notificationService";
import { passengerUser } from "./fixtures";

jest.mock("expo-router", () => ({ usePathname: () => "/home" }));

jest.mock("../contexts/SessionContext", () => {
  const { passengerUser: mockPassengerUser } = require("./fixtures");
  return { useSession: () => ({ user: mockPassengerUser, loading: false }) };
});

jest.mock("../services/notificationService", () => ({
  listNotifications: jest.fn(),
}));

const notices = [
  { id: "notice-1", user_id: passengerUser.id, type: "ride", title: "Ride", body: "Updated", read: false, created_at: "2026-08-24T10:00:00Z" },
  { id: "notice-2", user_id: passengerUser.id, type: "message", title: "Message", body: "Hello", read: true, created_at: "2026-08-24T10:01:00Z" },
];

describe("NotificationProvider", () => {
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
    (listNotifications as jest.Mock).mockResolvedValue(notices);
  });

  afterEach(() => jest.restoreAllMocks());

  const wrapper = ({ children }: { children: ReactNode }) => <NotificationProvider>{children}</NotificationProvider>;

  it("shares one snapshot and updates unread state locally", async () => {
    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.notifications).toHaveLength(2));
    expect(listNotifications).toHaveBeenCalledTimes(1);
    expect(result.current.unreadCount).toBe(1);

    act(() => result.current.markReadLocally("notice-1"));
    expect(result.current.unreadCount).toBe(0);
    expect(listNotifications).toHaveBeenCalledTimes(1);
  });

  it("refreshes once on resume without a repeating timer", async () => {
    renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(listNotifications).toHaveBeenCalledTimes(1));
    const timerSpy = jest.spyOn(global, "setInterval");
    currentState = "background";
    act(() => appStateListener("background"));
    currentState = "active";
    await act(async () => {
      appStateListener("active");
      await Promise.resolve();
    });
    expect(listNotifications).toHaveBeenCalledTimes(2);
    expect(timerSpy).not.toHaveBeenCalled();
  });
});
