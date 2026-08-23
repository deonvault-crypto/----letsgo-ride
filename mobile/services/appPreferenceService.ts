import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export type NavigationAppPreference = "system" | "google" | "apple";
const NAVIGATION_KEY = "letsgoride.preferences.navigation_app";

export async function getPreferredNavigationApp(): Promise<NavigationAppPreference> {
  const value = Platform.OS === "web" ? globalThis.localStorage?.getItem(NAVIGATION_KEY) : await SecureStore.getItemAsync(NAVIGATION_KEY);
  return value === "google" || value === "apple" ? value : "system";
}

export async function setPreferredNavigationApp(value: NavigationAppPreference) {
  if (Platform.OS === "web") globalThis.localStorage?.setItem(NAVIGATION_KEY, value);
  else await SecureStore.setItemAsync(NAVIGATION_KEY, value);
  return value;
}
