import { Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

import { getCurrentUser } from "./authService";
import { clearToken, getToken, saveToken } from "./api";
import { publishSessionUser } from "./sessionLifecycle";

const BIOMETRIC_ENABLED_KEY = "letsgoride.biometric.enabled";
const BIOMETRIC_TOKEN_KEY = "letsgoride.biometric.token";
const BIOMETRIC_PREFERENCE_KEY = "letsgoride.biometric.preference";
const BIOMETRIC_REMINDER_NEXT_AT_KEY = "letsgoride.biometric.reminder.next-at";

type BiometricPreference = "enabled" | "declined";

async function biometricPreference(): Promise<BiometricPreference | null> {
  if (Platform.OS === "web") return null;
  const value = await SecureStore.getItemAsync(BIOMETRIC_PREFERENCE_KEY).catch(() => null);
  return value === "enabled" || value === "declined" ? value : null;
}

async function clearBiometricCredential() {
  await Promise.all([
    SecureStore.deleteItemAsync(BIOMETRIC_TOKEN_KEY).catch(() => undefined),
    SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY).catch(() => undefined),
  ]);
}

export async function biometricAvailable() {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  return hasHardware && enrolled;
}

export async function biometricLabel() {
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  if (Platform.OS === "ios") {
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return "Use Face ID";
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return "Use Touch ID";
    return "Use biometrics";
  }
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return "Use fingerprint";
  return "Use biometrics";
}

export async function isBiometricEnabled() {
  const enabled = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
  const token = await SecureStore.getItemAsync(BIOMETRIC_TOKEN_KEY);
  if (enabled !== "true" || !token) return false;
  return biometricAvailable();
}

export async function biometricReminderDue(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    if (!await biometricAvailable()) return false;
    if (await isBiometricEnabled()) return false;
    // A deliberate choice survives normal logout/login. If the user previously
    // enabled biometrics, a fresh password login silently refreshes the protected
    // credential; if they declined, Settings is the place to opt in later.
    const preference = await biometricPreference();
    if (preference === "enabled" || preference === "declined") return false;
    const value = await SecureStore.getItemAsync(BIOMETRIC_REMINDER_NEXT_AT_KEY);
    if (!value) return true;
    const nextAt = Number(value);
    return !Number.isFinite(nextAt) || Date.now() >= nextAt;
  } catch {
    return false;
  }
}

export async function snoozeBiometricReminder(_days = 30) {
  if (Platform.OS === "web") return;
  try {
    await SecureStore.setItemAsync(BIOMETRIC_PREFERENCE_KEY, "declined");
    await SecureStore.deleteItemAsync(BIOMETRIC_REMINDER_NEXT_AT_KEY).catch(() => undefined);
  } catch {
    // Preference storage is best effort; never block the app over a reminder.
  }
}

async function clearBiometricReminder() {
  if (Platform.OS === "web") return;
  try {
    await SecureStore.deleteItemAsync(BIOMETRIC_REMINDER_NEXT_AT_KEY);
  } catch {
    // ignore reminder storage failures
  }
}

export async function hasBiometricLoginCredential() {
  return isBiometricEnabled();
}

export async function refreshBiometricCredentialAfterPasswordLogin() {
  if (Platform.OS === "web") return false;
  try {
    if (await biometricPreference() !== "enabled") return false;
    if (!await biometricAvailable()) return false;
    const token = await getToken();
    if (!token) return false;
    await SecureStore.setItemAsync(BIOMETRIC_TOKEN_KEY, token);
    await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, "true");
    return true;
  } catch {
    return false;
  }
}

export async function enableBiometricLogin() {
  if (!await biometricAvailable()) {
    throw new Error("Biometrics are not available or not enrolled on this device.");
  }
  const token = await getToken();
  if (!token) throw new Error("Log in before enabling biometric login.");
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: "Enable biometric login",
    fallbackLabel: "Use passcode",
    cancelLabel: "Cancel",
  });
  if (!result.success) throw new Error("Biometric confirmation was cancelled.");
  await SecureStore.setItemAsync(BIOMETRIC_TOKEN_KEY, token);
  await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, "true");
  await SecureStore.setItemAsync(BIOMETRIC_PREFERENCE_KEY, "enabled");
  await clearBiometricReminder();
}

export async function disableBiometricLogin() {
  await clearBiometricCredential();
  if (Platform.OS !== "web") {
    await SecureStore.setItemAsync(BIOMETRIC_PREFERENCE_KEY, "declined").catch(() => undefined);
  }
}

export async function loginWithBiometrics() {
  if (!await isBiometricEnabled()) {
    throw new Error("Biometric login is not enabled.");
  }
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: await biometricLabel(),
    fallbackLabel: "Use password",
    cancelLabel: "Cancel",
  });
  if (!result.success) throw new Error("Biometric login was cancelled.");
  const token = await SecureStore.getItemAsync(BIOMETRIC_TOKEN_KEY);
  if (!token) throw new Error("Please log in with your password again.");
  await saveToken(token);
  try {
    const user = await getCurrentUser();
    publishSessionUser(user);
    return user;
  } catch {
    await clearToken();
    // Keep the user's enabled preference. A successful password login refreshes
    // the credential without showing first-time Face ID onboarding again.
    await clearBiometricCredential();
    throw new Error("Please log in with your password again.");
  }
}
