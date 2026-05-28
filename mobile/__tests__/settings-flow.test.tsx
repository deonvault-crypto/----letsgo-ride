import { fireEvent, render, waitFor } from "@testing-library/react-native";

import SettingsScreen from "../app/(shared)/settings";
import { deleteAccount } from "../services/authService";
import { disableBiometricLogin, enableBiometricLogin, isBiometricEnabled } from "../services/biometricService";
import { updateNotificationPreferences } from "../services/notificationService";
import {
  enablePhoneNotifications,
  hasSeenNotificationExplanation,
  markNotificationExplanationSeen,
  phoneNotificationStatus,
} from "../services/pushNotificationService";
import { passengerUser } from "./fixtures";

const mockReplace = jest.fn();
const mockCurrentUser = passengerUser;

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace }),
  usePathname: () => "/settings",
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = require("react");
    React.useEffect(() => callback(), [callback]);
  },
}));

jest.mock("../hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({
    user: mockCurrentUser,
    loading: false,
    error: null,
    reload: jest.fn(),
  }),
}));

jest.mock("../services/authService", () => ({
  deleteAccount: jest.fn(async () => ({ deleted: true })),
  logout: jest.fn(),
}));

jest.mock("../services/biometricService", () => ({
  biometricAvailable: jest.fn(async () => true),
  biometricLabel: jest.fn(async () => "Use Face ID"),
  disableBiometricLogin: jest.fn(),
  enableBiometricLogin: jest.fn(),
  isBiometricEnabled: jest.fn(async () => true),
}));

jest.mock("../services/notificationService", () => ({
  getNotificationPreferences: jest.fn(async () => ({
    trip_updates: true,
    booking_requests: true,
    messages: true,
    verification_updates: true,
    support_replies: true,
    safety_alerts: true,
    marketing_messages: false,
  })),
  updateNotificationPreferences: jest.fn(),
  listNotifications: jest.fn(async () => []),
}));

jest.mock("../services/pushNotificationService", () => ({
  enablePhoneNotifications: jest.fn(async () => ({
    enabled: true,
    status: "on",
    message: "Phone notifications are enabled.",
  })),
  hasSeenNotificationExplanation: jest.fn(async () => true),
  markNotificationExplanationSeen: jest.fn(),
  phoneNotificationStatus: jest.fn(async () => ({
    enabled: false,
    status: "off",
    message: "Enable notifications in device settings",
  })),
}));

describe("settings account controls", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (enablePhoneNotifications as jest.Mock).mockResolvedValue({
      enabled: true,
      status: "on",
      message: "Phone notifications are enabled.",
    });
    (hasSeenNotificationExplanation as jest.Mock).mockResolvedValue(true);
    (phoneNotificationStatus as jest.Mock).mockResolvedValue({
      enabled: false,
      status: "off",
      message: "Enable notifications in device settings",
    });
  });

  it("shows disabled notification categories when phone notifications are off", async () => {
    const screen = render(<SettingsScreen />);

    await waitFor(() => {
      expect(screen.getByText("Phone notifications: Off")).toBeOnTheScreen();
      expect(screen.getByText("Enable notifications in device settings")).toBeOnTheScreen();
    });
    expect(screen.getByRole("button", { name: "Edit profile" })).toBeOnTheScreen();
    expect(screen.getByText("Account")).toBeOnTheScreen();
    expect(screen.getByText("Notifications")).toBeOnTheScreen();
    expect(screen.getByText("Security & Privacy")).toBeOnTheScreen();
    expect(screen.getByText("Support & Safety")).toBeOnTheScreen();
    expect(screen.getByText("Account Control")).toBeOnTheScreen();
    expect(screen.queryByText("Phone and document privacy")).toBeNull();
    expect(screen.queryByText("How LetsGoRide uses account data")).toBeNull();
    expect(screen.queryByRole("button", { name: "Change phone number" })).toBeNull();

    const tripUpdatesSwitch = screen.getByLabelText("Trip updates");
    expect(tripUpdatesSwitch.props.value).toBe(false);
    expect(tripUpdatesSwitch.props.disabled).toBe(true);

    fireEvent(tripUpdatesSwitch, "valueChange", true);
    expect(updateNotificationPreferences).not.toHaveBeenCalled();
  });

  it("shows short contextual privacy prompts instead of permanent privacy cards", async () => {
    (isBiometricEnabled as jest.Mock).mockResolvedValueOnce(false);
    const screen = render(<SettingsScreen />);

    await waitFor(() => {
      expect(screen.getByText("Security & Privacy")).toBeOnTheScreen();
    });

    fireEvent(screen.getByLabelText("Biometric login"), "valueChange", true);
    expect(await screen.findByText("Face ID will only unlock LetsGoRide on this device.")).toBeOnTheScreen();
    expect(enableBiometricLogin).not.toHaveBeenCalled();

    fireEvent.press(screen.getByRole("button", { name: "Enable biometric login" }));
    await waitFor(() => {
      expect(enableBiometricLogin).toHaveBeenCalled();
    });

    fireEvent.press(screen.getByRole("button", { name: "Verified identity badge" }));
    expect(screen.getByText("A verified badge means LetsGoRide has reviewed your identity documents. It helps build trust with passengers and drivers.")).toBeOnTheScreen();
  });

  it("shows the explanation before requesting phone notifications from settings", async () => {
    (hasSeenNotificationExplanation as jest.Mock).mockResolvedValueOnce(false);

    const screen = render(<SettingsScreen />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Enable phone notifications" })).toBeOnTheScreen();
    });

    fireEvent.press(screen.getByRole("button", { name: "Enable phone notifications" }));
    expect(await screen.findByText("Enable notifications?")).toBeOnTheScreen();

    fireEvent.press(screen.getByRole("button", { name: "Enable notifications" }));

    await waitFor(() => {
      expect(markNotificationExplanationSeen).toHaveBeenCalled();
      expect(enablePhoneNotifications).toHaveBeenCalled();
      expect(screen.getByText("Phone notifications: On")).toBeOnTheScreen();
    });

    const tripUpdatesSwitch = screen.getByLabelText("Trip updates");
    expect(tripUpdatesSwitch.props.value).toBe(true);
    expect(tripUpdatesSwitch.props.disabled).toBe(false);
  });

  it("requires explicit confirmation before deleting an account", async () => {
    const screen = render(<SettingsScreen />);

    await waitFor(() => {
      expect(screen.getByText("Phone notifications: Off")).toBeOnTheScreen();
    });

    fireEvent.press(screen.getAllByRole("button", { name: "Delete account" })[0]);

    expect(screen.getByText("Delete account?")).toBeOnTheScreen();
    expect(screen.getByText("This permanently deletes your LetsGoRide account, trips, messages, verification records, and saved preferences.")).toBeOnTheScreen();
    expect(screen.getByText("Type DELETE to confirm.")).toBeOnTheScreen();
    fireEvent.press(screen.getAllByRole("button", { name: "Delete account" }).at(-1)!);
    expect(deleteAccount).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByPlaceholderText("DELETE"), "DELETE");
    for (const button of screen.getAllByRole("button", { name: "Delete account" })) {
      fireEvent.press(button);
    }

    await waitFor(() => {
      expect(deleteAccount).toHaveBeenCalled();
      expect(disableBiometricLogin).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith("/(auth)/welcome");
    });
  });
});
