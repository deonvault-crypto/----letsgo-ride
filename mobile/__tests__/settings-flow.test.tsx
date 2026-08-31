import { fireEvent, render, waitFor } from "@testing-library/react-native";

import SettingsScreen from "../app/(shared)/settings";
import { enableBiometricLogin, isBiometricEnabled } from "../services/biometricService";
import { updateNotificationPreferences } from "../services/notificationService";
import {
  enablePhoneNotifications,
  hasSeenNotificationExplanation,
  markNotificationExplanationSeen,
  phoneNotificationStatus,
} from "../services/pushNotificationService";
import { passengerUser } from "./fixtures";

const mockCurrentUser = passengerUser;

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
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

describe("focused settings controls", () => {
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

  it("keeps Settings focused on notifications and security without repeating Account content", async () => {
    const screen = render(<SettingsScreen />);

    await waitFor(() => {
      expect(screen.getByText("Phone notifications: Off")).toBeOnTheScreen();
      expect(screen.getByText("Enable notifications in device settings")).toBeOnTheScreen();
    });

    expect(screen.getByText("Notifications")).toBeOnTheScreen();
    expect(screen.getByText("Security")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Account details" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Privacy Policy" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Terms of Service" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Safety" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete Account" })).toBeNull();
    expect(screen.queryByText("Legal & support")).toBeNull();

    expect(screen.getByText("Enable phone notifications first, then choose exactly which updates you want.")).toBeOnTheScreen();
    expect(screen.queryByLabelText("Service updates")).toBeNull();
    expect(updateNotificationPreferences).not.toHaveBeenCalled();
  });

  it("uses a short biometric explanation only when the user enables it", async () => {
    (isBiometricEnabled as jest.Mock).mockResolvedValueOnce(false);
    const screen = render(<SettingsScreen />);

    await waitFor(() => {
      expect(screen.getByText("Security")).toBeOnTheScreen();
    });

    fireEvent(screen.getByLabelText("Biometric login"), "valueChange", true);
    expect(await screen.findByText("Face ID or your device biometric only unlocks this LetsGoRide account on this device.")).toBeOnTheScreen();
    expect(enableBiometricLogin).not.toHaveBeenCalled();

    fireEvent.press(screen.getByRole("button", { name: "Enable biometric login" }));
    await waitFor(() => {
      expect(enableBiometricLogin).toHaveBeenCalled();
    });
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

    const serviceUpdatesSwitch = screen.getByLabelText("Service updates");
    expect(serviceUpdatesSwitch.props.value).toBe(true);
    expect(serviceUpdatesSwitch.props.disabled).toBe(false);
  });
});
