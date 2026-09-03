import * as Updates from "expo-updates";
import { requestData } from "./api";

export type StoreRelease = { platform: "ios" | "android"; version: string; notes: string; store_url: string; updated_at: string };
export const STORE_URLS = {
  ios: "https://apps.apple.com/app/id6772862281",
  android: "https://play.google.com/store/apps/details?id=com.letsgo.ride",
} as const;

export function isNewerVersion(next: string, current: string) {
  if (![next, current].every(value => /^\d+\.\d+\.\d+$/.test(value))) return false;
  const a = next.split(".").map(Number), b = current.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index];
  }
  return false;
}

export function getStoreReleases() {
  return requestData<StoreRelease[]>({ method: "GET", url: "/app-updates" });
}

let downloading: Promise<"ready" | "current" | "unsupported"> | null = null;
export function downloadCompatibleUpdate() {
  if (downloading) return downloading;
  downloading = (async () => {
    if (!Updates.isEnabled) return "unsupported" as const;
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) return "current" as const;
    await Updates.fetchUpdateAsync();
    // Deliberately never reload: navigation, payment, trip and handoff state keep running.
    return "ready" as const;
  })().finally(() => { downloading = null; });
  return downloading;
}
