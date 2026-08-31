import axios from "axios";

import { api, requestData, saveToken, getToken, toFriendlyApiError } from "./api";
import { User } from "../types/user.types";
import { clearPrivateSessionState, publishSessionUser } from "./sessionLifecycle";
import { disablePhoneNotifications } from "./pushNotificationService";
import { stopAllDriverBackgroundLocation } from "./hailingBackgroundLocation";
import { stopAllCourierBackgroundLocation } from "./courierBackgroundLocation";

type AuthPayload = { token: string; user: User };
type EmailVerificationPayload = {
  email: string;
  email_verified: boolean;
  message: string;
  token?: string;
  user?: User;
};

export async function emailLogin(email: string, password: string) {
  const result = await requestData<AuthPayload>({
    method: "POST",
    url: "/auth/email-login",
    data: { email, password },
  });
  await saveToken(result.token);
  publishSessionUser(result.user);
  return result;
}

export async function emailRegister(data: {
  name: string;
  email: string;
  password: string;
  confirm_password: string;
  city?: string;
}) {
  return requestData<EmailVerificationPayload>({
    method: "POST",
    url: "/auth/email-register",
    data,
  });
}

export async function verifyEmail(email: string, code: string) {
  const result = await requestData<EmailVerificationPayload>({
    method: "POST",
    url: "/auth/verify-email",
    data: { email, code },
  });
  if (result.token) await saveToken(result.token);
  if (result.user) publishSessionUser(result.user);
  return result;
}

export async function resendEmailVerification(email: string) {
  return requestData<EmailVerificationPayload>({
    method: "POST",
    url: "/auth/resend-email-verification",
    data: { email },
  });
}

export async function forgotPassword(email: string) {
  return requestData<{ message: string }>({
    method: "POST",
    url: "/auth/forgot-password",
    data: { email },
  });
}

export async function resetPassword(email: string, code: string, password: string, confirmPassword?: string) {
  return requestData<{ message: string }>({
    method: "POST",
    url: "/auth/reset-password",
    data: { email, code, password, confirm_password: confirmPassword },
  });
}

export async function getCurrentUser() {
  return requestData<User>({ method: "GET", url: "/auth/me" });
}

export async function updateCurrentUser(data: Partial<Pick<User, "phone" | "email" | "city" | "bio" | "travel_preferences" | "notification_trip_updates" | "notification_booking_requests" | "notification_support_replies" | "notification_safety_alerts" | "notification_marketing">>) {
  await requestData<User>({ method: "PATCH", url: "/auth/me", data });
  const confirmed = await getCurrentUser();
  publishSessionUser(confirmed);
  return confirmed;
}

export async function uploadProfilePhoto(asset: { uri: string; fileName?: string | null; mimeType?: string | null; type?: string | null }) {
  const formData = new FormData();
  formData.append("file", {
    uri: asset.uri,
    name: asset.fileName || "profile-photo.jpg",
    type: asset.mimeType || asset.type || "image/jpeg",
  } as unknown as Blob);
  try {
    const response = await api.post("/auth/me/profile-photo", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    if (!response.data.success) {
      throw new Error(response.data.error || "Unable to upload profile photo.");
    }
    const user = response.data.data as User;
    publishSessionUser(user);
    return user;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      throw new Error(toFriendlyApiError(err));
    }
    throw err;
  }
}

export async function deleteAccount() {
  const result = await requestData<{ deleted: boolean }>({ method: "DELETE", url: "/auth/me" });
  await stopNativeWorkBeforeSessionClear();
  await clearPrivateSessionState();
  return result;
}

async function stopNativeWorkBeforeSessionClear() {
  // Native location tasks can still be executing when a user signs out. Stop them
  // while the authenticated token and SecureStore state are still valid, then clear
  // session state. This avoids an iOS teardown race where a background task wakes
  // after its credentials have been deleted.
  await stopAllDriverBackgroundLocation().catch(() => undefined);
  await stopAllCourierBackgroundLocation().catch(() => undefined);
}

export async function logout() {
  await stopNativeWorkBeforeSessionClear();
  await disablePhoneNotifications().catch(() => undefined);
  await requestData<{ logged_out: boolean }>({ method: "POST", url: "/auth/logout" }).catch(() => undefined);
  await clearPrivateSessionState();
}

export async function logoutToGuest(router: { replace: (href: never) => void }) {
  await logout();
  router.replace("/(customer)/home" as never);
}

export async function hasSession() {
  return Boolean(await getToken());
}
