import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const PRIVATE_STORAGE_KEYS = [
  "letsgoride.auth.token",
  "letsgoride.biometric.enabled",
  "letsgoride.biometric.token",
  "letsgoride.push.token",
  "letsgoride.merchant.selected_restaurant",
];

const listeners = new Set<() => void>();

export function onSessionCleared(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export async function clearPrivateSessionState() {
  if (Platform.OS === "web") {
    PRIVATE_STORAGE_KEYS.forEach((key) => globalThis.localStorage?.removeItem(key));
  } else {
    await Promise.all(PRIVATE_STORAGE_KEYS.map(async (key) => {
      try { await SecureStore.deleteItemAsync(key); } catch { /* best-effort private cache purge */ }
    }));
  }
  listeners.forEach((listener) => listener());
}
