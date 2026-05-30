import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";

import { registerPushToken, unregisterPushToken } from "./notificationService";

const PUSH_TOKEN_STORAGE_KEY = "letsgoride.push.token";
const NOTIFICATION_EXPLANATION_STORAGE_KEY = "letsgoride.notifications.explanation.seen";
const PUSH_PERMISSION_REQUESTED_STORAGE_KEY = "letsgoride.notifications.permission.requested";
const ANDROID_DEFAULT_CHANNEL_ID = "default";

type PushRegistrationState = {
  enabled: boolean;
  status: "on" | "off";
  message?: string;
};

const DEVICE_SETTINGS_MESSAGE = "Enable notifications in device settings";

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

async function hasRequestedPhonePermission(): Promise<boolean> {
  if (Platform.OS === "web") return true;
  try {
    return (await SecureStore.getItemAsync(PUSH_PERMISSION_REQUESTED_STORAGE_KEY)) === "true";
  } catch {
    return false;
  }
}

async function markPhonePermissionRequested() {
  if (Platform.OS === "web") return;
  try {
    await SecureStore.setItemAsync(PUSH_PERMISSION_REQUESTED_STORAGE_KEY, "true");
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

async function registerCurrentPushToken(): Promise<PushRegistrationState> {
  const channelError = await ensureAndroidDefaultNotificationChannel();
  if (channelError) return channelError;

  const currentPermissions = await Notifications.getPermissionsAsync();
  if (!currentPermissions.granted) {
    await unregisterSavedPushToken();
    return {
      enabled: false,
      status: "off",
      message: DEVICE_SETTINGS_MESSAGE,
    };
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
      message: "Could not obtain a push token. Please try again or restart the app.",
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

    return {
      enabled: true,
      status: "on",
      message: "Phone notifications are enabled.",
    };
  } catch {
    await removeStoredPushToken();
    return {
      enabled: false,
      status: "off",
      message: "Phone notification permission is on, but LetsGoRide could not register this device. Please try again.",
    };
  }
}

export async function phoneNotificationStatus(): Promise<PushRegistrationState> {
  return registerCurrentPushToken();
}

export async function enablePhoneNotifications(): Promise<PushRegistrationState> {
  const channelError = await ensureAndroidDefaultNotificationChannel();
  if (channelError) return channelError;

  const current = await Notifications.getPermissionsAsync();
  const alreadyRequested = await hasRequestedPhonePermission();
  if (!current.granted && alreadyRequested) {
    return {
      enabled: false,
      status: "off",
      message: DEVICE_SETTINGS_MESSAGE,
    };
  }
  const permissions = current.granted ? current : await Notifications.requestPermissionsAsync();
  if (!current.granted) {
    await markPhonePermissionRequested();
  }

  if (!permissions.granted) {
    return {
      enabled: false,
      status: "off",
      message: DEVICE_SETTINGS_MESSAGE,
    };
  }

  return registerCurrentPushToken();
}

export async function disablePhoneNotifications(): Promise<PushRegistrationState> {
  await unregisterSavedPushToken();
  return {
    enabled: false,
    status: "off",
    message: "Phone notifications are disabled for this device.",
  };
}
