import { fireEvent, render, waitFor } from "@testing-library/react-native";

import EmailLoginScreen from "../app/(auth)/email-login";
import { emailLogin } from "../services/authService";
import { hasBiometricLoginCredential, loginWithBiometrics } from "../services/biometricService";
import { enablePhoneNotifications, hasSeenNotificationExplanation, markNotificationExplanationSeen } from "../services/pushNotificationService";
import { passengerUser } from "./fixtures";

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useLocalSearchParams: () => ({}),
  usePathname: () => "/email-login",
  useFocusEffect: (callback: () => void | (() => void)) => { const React = require("react"); React.useEffect(() => callback(), [callback]); },
}));

jest.mock("../services/authService", () => ({ emailLogin: jest.fn(), resendEmailVerification: jest.fn() }));
jest.mock("../services/biometricService", () => ({ biometricLabel: jest.fn(async () => "Use Face ID"), hasBiometricLoginCredential: jest.fn(async () => false), loginWithBiometrics: jest.fn() }));
jest.mock("../services/pushNotificationService", () => ({ enablePhoneNotifications: jest.fn(async () => ({ enabled: true, status: "on" })), hasSeenNotificationExplanation: jest.fn(async () => true), markNotificationExplanationSeen: jest.fn() }));

describe("email login flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (hasBiometricLoginCredential as jest.Mock).mockResolvedValue(false);
    (enablePhoneNotifications as jest.Mock).mockResolvedValue({ enabled: true, status: "on" });
    (hasSeenNotificationExplanation as jest.Mock).mockResolvedValue(true);
  });

  it("hides Face ID until biometric login was enabled on this device", async () => {
    const screen = render(<EmailLoginScreen />);
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Use Face ID" })).toBeNull();
      expect(screen.getByRole("button", { name: "Login" })).toBeOnTheScreen();
      expect(screen.getByRole("button", { name: "Create customer account" })).toBeOnTheScreen();
    });
  });

  it("accepts credentials and opens the customer product", async () => {
    (emailLogin as jest.Mock).mockResolvedValueOnce({ token: "token-1", user: passengerUser });
    const screen = render(<EmailLoginScreen />);
    fireEvent.changeText(screen.getByLabelText("Email"), "tendai@example.com");
    fireEvent.changeText(screen.getByLabelText("Password"), "securepass");
    fireEvent.press(screen.getByRole("button", { name: "Login" }));
    await waitFor(() => {
      expect(emailLogin).toHaveBeenCalledWith("tendai@example.com", "securepass");
      expect(mockReplace).toHaveBeenCalledWith("/(customer)/home");
    });
  });

  it("shows the notification explanation before the first system permission request", async () => {
    (emailLogin as jest.Mock).mockResolvedValueOnce({ token: "token-1", user: passengerUser });
    (hasSeenNotificationExplanation as jest.Mock).mockResolvedValueOnce(false);
    const screen = render(<EmailLoginScreen />);
    fireEvent.changeText(screen.getByLabelText("Email"), "tendai@example.com");
    fireEvent.changeText(screen.getByLabelText("Password"), "securepass");
    fireEvent.press(screen.getByRole("button", { name: "Login" }));
    expect(await screen.findByText("Enable notifications?")).toBeOnTheScreen();
    expect(enablePhoneNotifications).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole("button", { name: "Enable notifications" }));
    await waitFor(() => {
      expect(markNotificationExplanationSeen).toHaveBeenCalled();
      expect(enablePhoneNotifications).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith("/(customer)/home");
    });
  });

  it("shows a clear error when login fails", async () => {
    (emailLogin as jest.Mock).mockRejectedValueOnce(new Error("Invalid email or password."));
    const screen = render(<EmailLoginScreen />);
    fireEvent.changeText(screen.getByLabelText("Email"), "wrong@example.com");
    fireEvent.changeText(screen.getByLabelText("Password"), "wrongpass");
    fireEvent.press(screen.getByRole("button", { name: "Login" }));
    expect(await screen.findByText("Invalid email or password.")).toBeOnTheScreen();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("shows biometric login after it was enabled and routes after successful unlock", async () => {
    (hasBiometricLoginCredential as jest.Mock).mockResolvedValueOnce(true);
    (loginWithBiometrics as jest.Mock).mockResolvedValueOnce(passengerUser);
    const screen = render(<EmailLoginScreen />);
    fireEvent.press(await screen.findByRole("button", { name: "Use Face ID" }));
    await waitFor(() => {
      expect(loginWithBiometrics).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith("/(customer)/home");
    });
  });

  it("falls back to email and password when Face ID unlock fails", async () => {
    (hasBiometricLoginCredential as jest.Mock).mockResolvedValueOnce(true);
    (loginWithBiometrics as jest.Mock).mockRejectedValueOnce(new Error("Please log in with your password again."));
    const screen = render(<EmailLoginScreen />);
    fireEvent.press(await screen.findByRole("button", { name: "Use Face ID" }));
    await waitFor(() => {
      expect(screen.getByText("Please log in with your password again.")).toBeOnTheScreen();
      expect(screen.getByRole("button", { name: "Login" })).toBeOnTheScreen();
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });
});
