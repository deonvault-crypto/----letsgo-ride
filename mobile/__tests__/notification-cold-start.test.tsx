import { act, render, waitFor } from "@testing-library/react-native";
import * as Notifications from "expo-notifications";
import { NotificationNavigationContext, NotificationResponseRouter } from "../components/notifications/NotificationResponseRouter";

const mockPush = jest.fn();
let mockSegments = ["(customer)", "home"];
let mockSession = { user: { id: "customer", role: "passenger" }, loading: true };
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }), useSegments: () => mockSegments }));
jest.mock("../contexts/SessionContext", () => ({ useSession: () => mockSession }));
jest.mock("../services/pushNotificationService", () => ({ configureNotificationHandler: jest.fn() }));

const response = { notification: { request: { identifier: "push-1", content: { data: {
  notification_target: "announcement", notification_id: "notice-1", recipient_user_id: "customer",
} } } } } as unknown as Notifications.NotificationResponse;

describe("Notification cold start", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSegments = ["(customer)", "home"];
    mockSession = { user: { id: "customer", role: "passenger" }, loading: true };
    (Notifications.getLastNotificationResponseAsync as jest.Mock).mockResolvedValue(response);
  });
  it("waits for the account and handles the same tap only once", async () => {
    const screen = render(<NotificationResponseRouter />);
    await act(async () => undefined);
    expect(mockPush).not.toHaveBeenCalled();
    mockSession = { ...mockSession, loading: false };
    screen.rerender(<NotificationResponseRouter />);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/(shared)/announcement/notice-1"));
    const receive = (Notifications.addNotificationResponseReceivedListener as jest.Mock).mock.calls.at(-1)[0];
    act(() => receive(response));
    expect(mockPush).toHaveBeenCalledTimes(1);
  });
  it("waits for the launch screen and records priority over late active-job recovery", async () => {
    mockSession = { ...mockSession, loading: false };
    mockSegments = [];
    const intent = { current: null as string | null };
    const component = () => <NotificationNavigationContext.Provider value={intent}><NotificationResponseRouter /></NotificationNavigationContext.Provider>;
    const screen = render(component());
    await act(async () => undefined);
    expect(mockPush).not.toHaveBeenCalled();
    mockSegments = ["(auth)", "login"];
    screen.rerender(component());
    await act(async () => undefined);
    expect(mockPush).not.toHaveBeenCalled();
    mockSegments = ["(customer)", "home"];
    screen.rerender(component());
    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    expect(intent.current).toBe("customer:passenger");
  });
  it("does not navigate another signed-in account to a private announcement", async () => {
    mockSession = { user: { id: "other", role: "passenger" }, loading: false };
    render(<NotificationResponseRouter />);
    await act(async () => undefined);
    expect(mockPush).not.toHaveBeenCalled();
  });
});
