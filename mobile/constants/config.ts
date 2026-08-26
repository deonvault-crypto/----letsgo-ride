const configuredApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
const developmentFallback = "http://127.0.0.1:8000";

if (!configuredApiBaseUrl && typeof __DEV__ !== "undefined" && !__DEV__) {
  throw new Error("EXPO_PUBLIC_API_BASE_URL must be configured for non-development builds.");
}

export const API_BASE_URL = configuredApiBaseUrl || developmentFallback;
export const AUTHENTICATED_WEB_ENABLED = process.env.EXPO_PUBLIC_ENABLE_AUTHENTICATED_WEB === "true";
