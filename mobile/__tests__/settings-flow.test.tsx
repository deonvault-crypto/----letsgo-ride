import { fireEvent, render, waitFor } from "@testing-library/react-native";

import SettingsScreen from "../app/(shared)/settings";
import { deleteAccount } from "../services/authService";
import { disableBiometricLogin } from "../services/biometricService";
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
  enablePhoneNotifications: jest.fn(),
  phoneNotificationStatus: jest.fn(async () => ({ enabled: false, status: "off" })),
}));

describe("settings account controls", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("requires explicit confirmation before deleting an account", async () => {
    const screen = render(<SettingsScreen />);

    await waitFor(() => {
      expect(screen.getByText("Phone notifications: Off")).toBeOnTheScreen();
    });

    fireEvent.press(screen.getAllByRole("button", { name: "Delete account" })[0]);

    expect(screen.getByText("Delete account?")).toBeOnTheScreen();
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
