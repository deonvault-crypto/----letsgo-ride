import { requestData, saveToken, clearToken, getToken } from "./api";
import { User, UserRole } from "../types/user.types";

type AuthPayload = { token: string; user: User };

export async function requestOtp(phone: string) {
  return requestData<{ phone: string; message: string; dev_otp?: string }>({
    method: "POST",
    url: "/auth/request-otp",
    data: { phone },
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

export async function logout() {
  await clearToken();
}

export async function hasSession() {
  return Boolean(await getToken());
}
