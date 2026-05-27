import { fireEvent, render, waitFor } from "@testing-library/react-native";

import EmailLoginScreen from "../app/(auth)/email-login";
import { emailLogin } from "../services/authService";
import { isBiometricEnabled, loginWithBiometrics } from "../services/biometricService";
import {
  enablePhoneNotifications,
  hasSeenNotificationExplanation,
  markNotificationExplanationSeen,
} from "../services/pushNotificationService";
import { passengerUser } from "./fixtures";

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useLocalSearchParams: () => ({}),
  usePathname: () => "/email-login",
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = require("react");
    React.useEffect(() => callback(), [callback]);
  },
}));

jest.mock("../services/authService", () => ({
  emailLogin: jest.fn(),
  resendEmailVerification: jest.fn(),
}));

jest.mock("../services/biometricService", () => ({
  biometricLabel: jest.fn(async () => "Use Face ID"),
  isBiometricEnabled: jest.fn(async () => false),
  loginWithBiometrics: jest.fn(),
}));

jest.mock("../services/pushNotificationService", () => ({
  enablePhoneNotifications: jest.fn(async () => ({ enabled: true, status: "on" })),
  hasSeenNotificationExplanation: jest.fn(async () => true),
  markNotificationExplanationSeen: jest.fn(),
}));

describe("email login flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isBiometricEnabled as jest.Mock).mockResolvedValue(false);
    (enablePhoneNotifications as jest.Mock).mockResolvedValue({ enabled: true, status: "on" });
    (hasSeenNotificationExplanation as jest.Mock).mockResolvedValue(true);
  });

  it("accepts credentials, sends login request, stores session through auth service, and opens passenger home", async () => {
    (emailLogin as jest.Mock).mockResolvedValueOnce({
      token: "token-1",
      user: passengerUser,
    });

    const screen = render(<EmailLoginScreen />);

    fireEvent.changeText(screen.getByLabelText("Email"), "tendai@example.com");
    fireEvent.changeText(screen.getByLabelText("Password"), "securepass");
    fireEvent.press(screen.getByRole("button", { name: "Login" }));

    await waitFor(() => {
      expect(emailLogin).toHaveBeenCalledWith("tendai@example.com", "securepass");
      expect(mockReplace).toHaveBeenCalledWith("/(passenger)/home");
    });
  });

  it("shows the notification explanation before the first system permission request", async () => {
    (emailLogin as jest.Mock).mockResolvedValueOnce({
      token: "token-1",
      user: passengerUser,
    });
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
      expect(mockReplace).toHaveBeenCalledWith("/(passenger)/home");
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
    (isBiometricEnabled as jest.Mock).mockResolvedValueOnce(true);
    (loginWithBiometrics as jest.Mock).mockResolvedValueOnce(passengerUser);

    const screen = render(<EmailLoginScreen />);

    const biometricButton = await screen.findByRole("button", { name: "Use Face ID" });
    fireEvent.press(biometricButton);

    await waitFor(() => {
      expect(loginWithBiometrics).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith("/(passenger)/home");
    });
  });
});
