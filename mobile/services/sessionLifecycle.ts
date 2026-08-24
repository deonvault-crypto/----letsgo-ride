import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { User } from "../types/user.types";

const PRIVATE_STORAGE_KEYS = [
  "letsgoride.auth.token",
  "letsgoride.biometric.enabled",
  "letsgoride.biometric.token",
  "letsgoride.push.token",
  "letsgoride.merchant.selected_restaurant",
];

const listeners = new Set<() => void>();
const userListeners = new Set<(user: User) => void>();

export function onSessionCleared(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function onSessionUserUpdated(listener: (user: User) => void) {
  userListeners.add(listener);
  return () => { userListeners.delete(listener); };
}

export function publishSessionUser(user: User) {
  userListeners.forEach((listener) => listener(user));
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
