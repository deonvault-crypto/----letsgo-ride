import { requestData, saveToken, clearToken, getToken } from "./api";
import { User, UserRole } from "../types/user.types";

type AuthPayload = { token: string; user: User };

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
  city?: string;
}) {
  const result = await requestData<AuthPayload>({
    method: "POST",
    url: "/auth/email-register",
    data,
  });
  await saveToken(result.token);
  return result;
}

export async function forgotPassword(email: string) {
  return requestData<{ message: string }>({
    method: "POST",
    url: "/auth/forgot-password",
    data: { email },
  });
}

export async function resetPassword(email: string, code: string, password: string) {
  return requestData<{ message: string }>({
    method: "POST",
    url: "/auth/reset-password",
    data: { email, code, password },
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

export async function updateCurrentUser(data: Partial<Pick<User, "name" | "phone" | "email" | "city" | "bio" | "travel_preferences" | "profile_photo_url" | "profile_photo_name" | "role">>) {
  return requestData<User>({ method: "PATCH", url: "/auth/me", data });
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
