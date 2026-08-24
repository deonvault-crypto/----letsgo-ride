import { Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

import { getCurrentUser } from "./authService";
import { clearToken, getToken, saveToken } from "./api";
import { publishSessionUser } from "./sessionLifecycle";

const BIOMETRIC_ENABLED_KEY = "letsgoride.biometric.enabled";
const BIOMETRIC_TOKEN_KEY = "letsgoride.biometric.token";

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

export async function hasBiometricLoginCredential() {
  return isBiometricEnabled();
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
}

export async function disableBiometricLogin() {
  await SecureStore.deleteItemAsync(BIOMETRIC_TOKEN_KEY);
  await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);
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
    await disableBiometricLogin();
    throw new Error("Please log in with your password again.");
  }
}
