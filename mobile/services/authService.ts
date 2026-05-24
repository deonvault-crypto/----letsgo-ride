import { api, requestData, saveToken, clearToken, getToken } from "./api";
import { User, UserRole } from "../types/user.types";

type AuthPayload = { token: string; user: User };
type EmailVerificationPayload = {
  email: string;
  email_verified: boolean;
  message: string;
  token?: string;
  user?: User;
};

export async function requestOtp(phone: string) {
  return requestData<{ phone: string; message: string }>({
    method: "POST",
    url: "/auth/request-otp",
    data: { phone },
  });
}

export async function emailLogin(email: string, password: string) {
  const result = await requestData<AuthPayload>({
    method: "POST",
    url: "/auth/email-login",
    data: { email, password },
  });
  await saveToken(result.token);
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

export async function verifyOtp(phone: string, otp: string, role: UserRole) {
  const result = await requestData<AuthPayload>({
    method: "POST",
    url: "/auth/verify-otp",
    data: { phone, otp, role },
  });
  await saveToken(result.token);
  return result;
}

export async function getCurrentUser() {
  return requestData<User>({ method: "GET", url: "/auth/me" });
}

export async function updateCurrentUser(data: Partial<Pick<User, "name" | "phone" | "email" | "city" | "bio" | "travel_preferences" | "profile_photo_url" | "profile_photo_name" | "role" | "notification_trip_updates" | "notification_booking_requests" | "notification_support_replies" | "notification_safety_alerts" | "notification_marketing">>) {
  return requestData<User>({ method: "PATCH", url: "/auth/me", data });
}

export async function uploadProfilePhoto(asset: { uri: string; fileName?: string | null; mimeType?: string | null; type?: string | null }) {
  const formData = new FormData();
  formData.append("file", {
    uri: asset.uri,
    name: asset.fileName || "profile-photo.jpg",
    type: asset.mimeType || asset.type || "image/jpeg",
  } as unknown as Blob);
  const response = await api.post("/auth/me/profile-photo", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  if (!response.data.success) {
    throw new Error(response.data.error || "Unable to upload profile photo.");
  }
  return response.data.data as User;
}

export async function deleteAccount() {
  const result = await requestData<{ deleted: boolean }>({ method: "DELETE", url: "/auth/me" });
  await clearToken();
  return result;
}

export async function logout() {
  await clearToken();
}

export async function hasSession() {
  return Boolean(await getToken());
}
