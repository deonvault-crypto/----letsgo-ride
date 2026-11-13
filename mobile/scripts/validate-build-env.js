const profile = String(process.env.EAS_BUILD_PROFILE || "").trim();
const platform = String(process.env.EAS_BUILD_PLATFORM || "").trim().toLowerCase();
const apiBaseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL || "").trim();
const googleMapsAndroidApiKey = String(process.env.GOOGLE_MAPS_ANDROID_API_KEY || "").trim();
const googleServicesJson = String(process.env.GOOGLE_SERVICES_JSON || "").trim();
const PRODUCTION_API_ORIGIN = "https://letsgoride-v2-production.onrender.com";

if (profile && profile !== "production") {
  throw new Error(`Unsupported EAS build profile: ${profile}. LetsGoRide native releases are production-only.`);
}

if (profile && !apiBaseUrl) {
  throw new Error(`EXPO_PUBLIC_API_BASE_URL is required for the ${profile} EAS build profile.`);
}

let parsedApiUrl;
if (apiBaseUrl) {
  try {
    parsedApiUrl = new URL(apiBaseUrl);
  } catch {
    throw new Error("EXPO_PUBLIC_API_BASE_URL must be a valid absolute URL.");
  }
  if (parsedApiUrl.protocol !== "https:" || parsedApiUrl.username || parsedApiUrl.password) {
    throw new Error("Build API configuration must use credential-free HTTPS.");
  }
  if ((parsedApiUrl.pathname && parsedApiUrl.pathname !== "/") || parsedApiUrl.search || parsedApiUrl.hash) {
    throw new Error("Build API configuration must use the canonical API origin without a path, query, or fragment.");
  }
}

if (profile === "production" && parsedApiUrl?.origin !== PRODUCTION_API_ORIGIN) {
  throw new Error(`Production builds must explicitly target ${PRODUCTION_API_ORIGIN}.`);
}

if (profile === "production" && platform === "android") {
  if (!googleMapsAndroidApiKey) {
    throw new Error("GOOGLE_MAPS_ANDROID_API_KEY is required for Android release builds.");
  }
  if (!googleServicesJson) {
    throw new Error("GOOGLE_SERVICES_JSON is required for Android release builds.");
  }
}
