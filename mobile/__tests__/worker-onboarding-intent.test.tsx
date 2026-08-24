import { fireEvent, render, waitFor } from "@testing-library/react-native";

import WorkWithUsScreen from "../app/(shared)/work-with-us";
import EmailLoginScreen from "../app/(auth)/email-login";

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockParams: Record<string, string> = {};
let mockAccount = { user: null as null | { name: string; role: "passenger" }, isGuest: true, loading: false, error: null, reload: jest.fn() };

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn(), canGoBack: () => false }),
  useLocalSearchParams: () => mockParams,
  useSegments: () => ["(shared)", "work-with-us"],
  usePathname: () => "/work-with-us",
}));

jest.mock("../hooks/useCurrentUser", () => ({ useCurrentUser: () => mockAccount }));
jest.mock("../services/authService", () => ({ emailLogin: jest.fn(), resendEmailVerification: jest.fn() }));
jest.mock("../services/biometricService", () => ({ biometricLabel: jest.fn(async () => "Use Face ID"), hasBiometricLoginCredential: jest.fn(async () => false), loginWithBiometrics: jest.fn() }));
jest.mock("../services/pushNotificationService", () => ({ enablePhoneNotifications: jest.fn(), hasSeenNotificationExplanation: jest.fn(async () => true), markNotificationExplanationSeen: jest.fn() }));

describe("worker onboarding intent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
    mockAccount = { user: null, isGuest: true, loading: false, error: null, reload: jest.fn() };
  });

  it.each([
    ["Apply to deliver", "courier_application"],
    ["Become a Driver", "driver_application"],
    ["Partner with LetsGoRide", "merchant_application"],
  ])("keeps %s selected while a guest authenticates", (label, intent) => {
    const screen = render(<WorkWithUsScreen />);
    fireEvent.press(screen.getByRole("button", { name: label }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/(auth)/email-login", params: { intent } });
  });

  it("uses a safe application fallback for an intent deep link", async () => {
    mockParams = { intent: "courier_application" };
    const screen = render(<EmailLoginScreen />);
    fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(mockReplace).toHaveBeenCalledWith("/(shared)/work-with-us");
    await waitFor(() => expect(screen.getAllByText("Apply to deliver").length).toBeGreaterThan(0));
  });

  it("opens the selected application directly for an authenticated customer", () => {
    mockAccount = { user: { name: "Tariro", role: "passenger" }, isGuest: false, loading: false, error: null, reload: jest.fn() };
    const screen = render(<WorkWithUsScreen />);
    fireEvent.press(screen.getByRole("button", { name: "Become a Driver" }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/(shared)/worker-application", params: { product: "driver" } });
  });

  it.each([
    ["courier_application", "Apply to deliver", "Create an account or sign in to continue your Courier application."],
    ["driver_application", "Become a Driver", "Create an account or sign in to continue your Driver application."],
    ["merchant_application", "Partner with LetsGoRide", "Create an account or sign in to continue your business application."],
  ])("uses contextual authentication copy for %s", async (intent, title, body) => {
    mockParams = { intent };
    const screen = render(<EmailLoginScreen />);
    await waitFor(() => {
      expect(screen.getAllByText(title).length).toBeGreaterThan(0);
      expect(screen.getByText(body)).toBeOnTheScreen();
      expect(screen.queryByText(/customer account/i)).toBeNull();
    });
  });
});
