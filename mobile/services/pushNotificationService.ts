import { Linking, Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";

import { registerPushToken, unregisterPushToken } from "./notificationService";

const PUSH_TOKEN_STORAGE_KEY = "letsgoride.push.token";
const NOTIFICATION_EXPLANATION_STORAGE_KEY = "letsgoride.notifications.explanation.seen";
const NOTIFICATION_REMINDER_NEXT_AT_KEY = "letsgoride.notifications.reminder.next-at";
const ANDROID_DEFAULT_CHANNEL_ID = "default";

export type PushRegistrationState = {
  enabled: boolean;
  status: "on" | "off";
  message?: string;
  canAskAgain?: boolean;
  requiresSettings?: boolean;
};

const DEVICE_SETTINGS_MESSAGE = "Notifications are off in device settings. Open device settings to allow them.";
const READY_TO_ENABLE_MESSAGE = "Tap below to allow phone notifications.";

function projectId() {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId || Constants.easConfig?.projectId;
}

export function configureNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: true,
    }),
  });
}

async function ensureAndroidDefaultNotificationChannel(): Promise<PushRegistrationState | null> {
  if (Platform.OS !== "android") return null;
  try {
    await Notifications.setNotificationChannelAsync(ANDROID_DEFAULT_CHANNEL_ID, {
      name: "Default",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#118B44",
      sound: "default",
      enableVibrate: true,
      showBadge: true,
    });
    return null;
  } catch {
    return {
      enabled: false,
      status: "off",
      message: "Could not prepare Android notifications. Please try again.",
      canAskAgain: true,
      requiresSettings: false,
    };
  }
}

async function getStoredPushToken(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  try {
    return await SecureStore.getItemAsync(PUSH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

async function saveStoredPushToken(token: string) {
  if (Platform.OS === "web") return;
  try {
    await SecureStore.setItemAsync(PUSH_TOKEN_STORAGE_KEY, token);
  } catch {
    // ignore storage failures
  }
}

async function removeStoredPushToken() {
  if (Platform.OS === "web") return;
  try {
    await SecureStore.deleteItemAsync(PUSH_TOKEN_STORAGE_KEY);
  } catch {
    // ignore storage failures
  }
}

export async function hasSeenNotificationExplanation(): Promise<boolean> {
  if (Platform.OS === "web") return true;
  try {
    return (await SecureStore.getItemAsync(NOTIFICATION_EXPLANATION_STORAGE_KEY)) === "true";
  } catch {
    return false;
  }
}

export async function markNotificationExplanationSeen() {
  if (Platform.OS === "web") return;
  try {
    await SecureStore.setItemAsync(NOTIFICATION_EXPLANATION_STORAGE_KEY, "true");
  } catch {
    // ignore storage failures
  }
}

export async function notificationReminderDue(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const value = await SecureStore.getItemAsync(NOTIFICATION_REMINDER_NEXT_AT_KEY);
    if (!value) return true;
    const nextAt = Number(value);
    return !Number.isFinite(nextAt) || Date.now() >= nextAt;
  } catch {
    return true;
  }
}

export async function snoozeNotificationReminder(days = 7) {
  if (Platform.OS === "web") return;
  try {
    const nextAt = Date.now() + days * 24 * 60 * 60 * 1000;
    await SecureStore.setItemAsync(NOTIFICATION_REMINDER_NEXT_AT_KEY, String(nextAt));
  } catch {
    // ignore storage failures
  }
}

async function clearNotificationReminder() {
  if (Platform.OS === "web") return;
  try {
    await SecureStore.deleteItemAsync(NOTIFICATION_REMINDER_NEXT_AT_KEY);
  } catch {
    // ignore storage failures
  }
}

async function unregisterSavedPushToken() {
  const savedToken = await getStoredPushToken();
  if (!savedToken) return;

  try {
    await unregisterPushToken({
      expo_push_token: savedToken,
      platform: Platform.OS,
    });
  } catch {
    // ignore server cleanup failures
  }

  await removeStoredPushToken();
}

type NotificationPermissionState = Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>;

function permissionGranted(permissions: NotificationPermissionState) {
  if (permissions.granted) return true;
  if (Platform.OS !== "ios") return false;
  const status = permissions.ios?.status;
  return status === Notifications.IosAuthorizationStatus.AUTHORIZED
    || status === Notifications.IosAuthorizationStatus.PROVISIONAL
    || status === Notifications.IosAuthorizationStatus.EPHEMERAL;
}

function disabledPermissionState(permissions: NotificationPermissionState): PushRegistrationState {
  const canAskAgain = permissions.canAskAgain !== false;
  return {
    enabled: false,
    status: "off",
    canAskAgain,
    requiresSettings: !canAskAgain,
    message: canAskAgain ? READY_TO_ENABLE_MESSAGE : DEVICE_SETTINGS_MESSAGE,
  };
}

async function registerCurrentPushToken(permissions?: NotificationPermissionState): Promise<PushRegistrationState> {
  const channelError = await ensureAndroidDefaultNotificationChannel();
  if (channelError) return channelError;

  const currentPermissions = permissions || await Notifications.getPermissionsAsync();
  if (!permissionGranted(currentPermissions)) {
    await unregisterSavedPushToken();
    return disabledPermissionState(currentPermissions);
  }

  let expoPushToken: string;
  try {
    const tokenResult = await Notifications.getExpoPushTokenAsync(
      projectId() ? { projectId: projectId() } : undefined,
    );
    expoPushToken = tokenResult.data;
  } catch {
    return {
      enabled: false,
      status: "off",
      canAskAgain: true,
      requiresSettings: false,
      message: "Notification permission is on, but this device could not get a push token. Please try again.",
    };
  }

  try {
    await registerPushToken({
      expo_push_token: expoPushToken,
      platform: Platform.OS,
      app_version: Constants.expoConfig?.version,
      device_name: Constants.deviceName || undefined,
    });
    await saveStoredPushToken(expoPushToken);
    await clearNotificationReminder();

    return {
      enabled: true,
      status: "on",
      canAskAgain: true,
      requiresSettings: false,
      message: "Phone notifications are enabled.",
    };
  } catch {
    await removeStoredPushToken();
    return {
      enabled: false,
      status: "off",
      canAskAgain: true,
      requiresSettings: false,
      message: "Notification permission is on, but LetsGoRide could not register this device. Please try again.",
    };
  }
}

export async function phoneNotificationStatus(): Promise<PushRegistrationState> {
  return registerCurrentPushToken();
}

export async function openPhoneNotificationSettings() {
  if (Platform.OS === "web") return;
  await Linking.openSettings();
}

export async function enablePhoneNotifications(): Promise<PushRegistrationState> {
  const channelError = await ensureAndroidDefaultNotificationChannel();
  if (channelError) return channelError;

  const current = await Notifications.getPermissionsAsync();
  if (permissionGranted(current)) return registerCurrentPushToken(current);

  if (current.canAskAgain === false) {
    await openPhoneNotificationSettings();
    return disabledPermissionState(current);
  }

  const permissions = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });

  if (!permissionGranted(permissions)) {
    await unregisterSavedPushToken();
    return disabledPermissionState(permissions);
  }

  return registerCurrentPushToken(permissions);
}

export async function disablePhoneNotifications(): Promise<PushRegistrationState> {
  await unregisterSavedPushToken();
  return {
    enabled: false,
    status: "off",
    canAskAgain: true,
    requiresSettings: false,
    message: "Phone notifications are disabled for this device.",
  };
}
