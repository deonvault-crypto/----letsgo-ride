import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { User } from "../types/user.types";

const PRIVATE_STORAGE_KEYS = [
  "letsgoride.auth.token",
  "letsgoride.auth.user-snapshot",
  "letsgoride.biometric.enabled",
  "letsgoride.biometric.token",
  "letsgoride.push.token",
  "letsgoride.merchant.selected_restaurant",
];
const SESSION_USER_SNAPSHOT_KEY = "letsgoride.auth.user-snapshot";

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
  void writeSessionUserSnapshot(user);
  userListeners.forEach((listener) => listener(user));
}

export async function readSessionUserSnapshot(): Promise<User | null> {
  try {
    const value = Platform.OS === "web"
      ? globalThis.localStorage?.getItem(SESSION_USER_SNAPSHOT_KEY)
      : await SecureStore.getItemAsync(SESSION_USER_SNAPSHOT_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as User;
    return parsed?.id && parsed?.role ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeSessionUserSnapshot(user: User): Promise<void> {
  try {
    const value = JSON.stringify(user);
    if (Platform.OS === "web") globalThis.localStorage?.setItem(SESSION_USER_SNAPSHOT_KEY, value);
    else await SecureStore.setItemAsync(SESSION_USER_SNAPSHOT_KEY, value);
  } catch {
    // The server session remains authoritative when a best-effort local snapshot fails.
  }
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
