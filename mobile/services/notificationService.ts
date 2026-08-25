import { AppNotification, NotificationPreferences, PushTokenRegistration } from "../types/notification.types";
import { requestData } from "./api";

export async function listNotifications() {
  return requestData<AppNotification[]>({ method: "GET", url: "/notifications" });
}

export async function markNotificationRead(id: string) {
  return requestData<AppNotification>({ method: "POST", url: `/notifications/${id}/read` });
}

export async function markAllNotificationsRead() {
  return requestData<{ read: boolean }>({ method: "POST", url: "/notifications/read-all" });
}

export async function getNotificationPreferences() {
  return requestData<NotificationPreferences>({ method: "GET", url: "/notifications/preferences" });
}

export async function updateNotificationPreferences(data: Partial<NotificationPreferences>) {
  return requestData<NotificationPreferences>({ method: "PUT", url: "/notifications/preferences", data });
}

export async function registerPushToken(data: PushTokenRegistration) {
  return requestData<PushTokenRegistration>({ method: "POST", url: "/notifications/register-token", data });
}

export async function unregisterPushToken(data: PushTokenRegistration) {
  return requestData<{ active: boolean }>({ method: "DELETE", url: "/notifications/unregister-token", data });
}
