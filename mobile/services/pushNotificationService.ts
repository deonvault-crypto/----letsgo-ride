import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";

import { registerPushToken } from "./notificationService";

type PushRegistrationState = {
  enabled: boolean;
  status: "on" | "off";
  message?: string;
};

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

export async function phoneNotificationStatus(): Promise<PushRegistrationState> {
  const permissions = await Notifications.getPermissionsAsync();
  return {
    enabled: permissions.granted,
    status: permissions.granted ? "on" : "off",
  };
}

export async function enablePhoneNotifications(): Promise<PushRegistrationState> {
  const current = await Notifications.getPermissionsAsync();
  const permissions = current.granted ? current : await Notifications.requestPermissionsAsync();
  if (!permissions.granted) {
    return {
      enabled: false,
      status: "off",
      message: "Notifications are off. You can enable them in phone settings.",
    };
  }

  const tokenResult = await Notifications.getExpoPushTokenAsync(
    projectId() ? { projectId: projectId() } : undefined,
  );
  const expoPushToken = tokenResult.data;
  await registerPushToken({
    expo_push_token: expoPushToken,
    platform: Platform.OS,
    app_version: Constants.expoConfig?.version,
  });

  return {
    enabled: true,
    status: "on",
    message: "Phone notifications are enabled.",
  };
}
