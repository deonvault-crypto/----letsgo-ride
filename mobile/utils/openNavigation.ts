import { Linking, Platform } from "react-native";
import { getPreferredNavigationApp } from "../services/appPreferenceService";

type NavigationDestination = string | { latitude?: number | null; longitude?: number | null; label?: string };

export async function openNavigation(destination: NavigationDestination) {
  const hasCoordinates = typeof destination !== "string"
    && typeof destination.latitude === "number"
    && typeof destination.longitude === "number";
  const clean = typeof destination === "string"
    ? destination.trim()
    : hasCoordinates
      ? `${destination.latitude},${destination.longitude}`
      : (destination.label || "").trim();
  if (!clean) throw new Error("Destination is unavailable for navigation.");

  const encoded = encodeURIComponent(clean);
  const preference = await getPreferredNavigationApp();
  const appleUrl = `http://maps.apple.com/?daddr=${encoded}&dirflg=d`;
  const googleUrl = `https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=driving`;
  const primary = preference === "google"
    ? googleUrl
    : preference === "apple" && Platform.OS === "ios"
      ? appleUrl
      : Platform.OS === "ios"
    ? `http://maps.apple.com/?daddr=${encoded}&dirflg=d`
    : googleUrl;
  const fallback = `https://www.google.com/maps/search/?api=1&query=${encoded}`;

  try {
    const canOpenPrimary = await Linking.canOpenURL(primary);
    if (canOpenPrimary) {
      await Linking.openURL(primary);
      return;
    }
    await Linking.openURL(fallback);
  } catch {
    throw new Error("Navigation could not be opened on this device.");
  }
}
