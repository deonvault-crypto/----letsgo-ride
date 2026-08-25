import { Linking } from "react-native";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";

import { registerPushToken, unregisterPushToken } from "../services/notificationService";
import { enablePhoneNotifications, phoneNotificationStatus } from "../services/pushNotificationService";

jest.mock("react-native", () => {
  const actual = jest.requireActual("react-native");
  return {
    ...actual,
    Platform: { ...actual.Platform, OS: "ios" },
    Linking: { ...actual.Linking, openSettings: jest.fn() },
  };
});

jest.mock("expo-constants", () => ({
  expoConfig: { version: "1.0.1", extra: { eas: { projectId: "test-project" } } },
  easConfig: { projectId: "test-project" },
  deviceName: "QA iPhone",
}));

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock("expo-notifications", () => ({
  IosAuthorizationStatus: {
    NOT_DETERMINED: 0,
    DENIED: 1,
    AUTHORIZED: 2,
    PROVISIONAL: 3,
    EPHEMERAL: 4,
  },
  AndroidImportance: { HIGH: 4 },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
}));

jest.mock("../services/notificationService", () => ({
  registerPushToken: jest.fn(),
  unregisterPushToken: jest.fn(),
}));

const permission = (overrides: Record<string, unknown>) => ({
  granted: false,
  canAskAgain: true,
  status: "undetermined",
  expires: "never",
  ios: { status: Notifications.IosAuthorizationStatus.NOT_DETERMINED },
  ...overrides,
});

describe("push notification permission flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
    (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({ data: "ExponentPushToken[test]" });
    (registerPushToken as jest.Mock).mockResolvedValue(undefined);
    (unregisterPushToken as jest.Mock).mockResolvedValue(undefined);
    (Linking.openSettings as jest.Mock).mockResolvedValue(undefined);
  });

  it("requests the native permission when iOS can still ask", async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue(permission({ canAskAgain: true }));
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue(permission({
      granted: true,
      status: "granted",
      ios: { status: Notifications.IosAuthorizationStatus.AUTHORIZED },
    }));

    const result = await enablePhoneNotifications();

    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(registerPushToken).toHaveBeenCalledTimes(1);
    expect(result.enabled).toBe(true);
    expect(result.requiresSettings).toBe(false);
  });

  it("opens device settings instead of silently failing after permission was denied", async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue(permission({
      canAskAgain: false,
      status: "denied",
      ios: { status: Notifications.IosAuthorizationStatus.DENIED },
    }));

    const result = await enablePhoneNotifications();

    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(Linking.openSettings).toHaveBeenCalledTimes(1);
    expect(result.enabled).toBe(false);
    expect(result.requiresSettings).toBe(true);
  });

  it("treats provisional iOS notification permission as enabled", async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue(permission({
      ios: { status: Notifications.IosAuthorizationStatus.PROVISIONAL },
    }));

    const result = await phoneNotificationStatus();

    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(registerPushToken).toHaveBeenCalledTimes(1);
    expect(result.enabled).toBe(true);
  });
});
