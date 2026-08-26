const profile = String(process.env.EAS_BUILD_PROFILE || "").trim();
const apiBaseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL || "").trim();
const STAGING_API_ORIGIN = "https://letsgoride-v2-staging.onrender.com";
const PRODUCTION_API_ORIGIN = "https://letsgoride-v2-production.onrender.com";

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

if (profile === "preview" && parsedApiUrl?.origin !== STAGING_API_ORIGIN) {
  throw new Error(`Preview builds must explicitly target ${STAGING_API_ORIGIN}.`);
}

if (profile === "production" && parsedApiUrl?.origin !== PRODUCTION_API_ORIGIN) {
  throw new Error(`Production builds must explicitly target ${PRODUCTION_API_ORIGIN}.`);
}
