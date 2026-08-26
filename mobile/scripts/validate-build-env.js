const profile = String(process.env.EAS_BUILD_PROFILE || "").trim();
const apiBaseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL || "").trim();

if (profile && !apiBaseUrl) {
  throw new Error(`EXPO_PUBLIC_API_BASE_URL is required for the ${profile} EAS build profile.`);
}

if (profile === "preview" && !/staging/i.test(apiBaseUrl)) {
  throw new Error("Preview builds must explicitly target the staging API.");
}

if (profile === "production" && /staging/i.test(apiBaseUrl)) {
  throw new Error("Production builds cannot target the staging API.");
}
