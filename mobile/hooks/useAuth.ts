import { useState } from "react";

import { User, UserRole } from "../types/user.types";
import * as authService from "../services/authService";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestOtp(phone: string) {
    setLoading(true);
    setError(null);
    try {
      return await authService.requestOtp(phone);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to request OTP.";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(phone: string, otp: string, role: UserRole) {
    setLoading(true);
    setError(null);
    try {
      const result = await authService.verifyOtp(phone, otp, role);
      setUser(result.user);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to verify OTP.";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await authService.logout();
    setUser(null);
  }

  return { user, loading, error, requestOtp, verifyOtp, logout };
}
