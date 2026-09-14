const app = require("../app.json").expo;
const eas = require("../eas.json");

const EXPECTED_PROJECT_ID = "6a3f6705-1e96-4f17-b884-b928baebf0ba";
const EXPECTED_UPDATE_URL = `https://u.expo.dev/${EXPECTED_PROJECT_ID}`;
const EXPECTED_PRODUCTION_ENV = Object.freeze({
  EXPO_PUBLIC_API_BASE_URL: "https://letsgoride-v2-production.onrender.com",
  EXPO_PUBLIC_ENABLE_AUTHENTICATED_WEB: "false",
});

function fail(message) {
  throw new Error(message);
}

function verifyProductionReleaseConfig() {
  const buildProfiles = Object.keys(eas.build || {});
  if (JSON.stringify(buildProfiles) !== JSON.stringify(["production"])) {
    fail(`Unexpected build profiles: ${buildProfiles.join(", ")}`);
  }

  const production = eas.build?.production;
  if (!production) fail("Missing production build profile.");
  for (const [name, value] of Object.entries(EXPECTED_PRODUCTION_ENV)) {
    if (production.env?.[name] !== value) fail(`Production setting mismatch: ${name}`);
  }
  if (production.channel !== "production") fail("Production build channel mismatch.");
  if (production.android?.buildType !== "app-bundle") fail("Android production build must be an app bundle.");

  const androidSubmit = eas.submit?.production?.android;
  if (androidSubmit?.track !== "production") fail("Android submission is not targeting production.");
  if (androidSubmit?.releaseStatus !== "completed") fail("Android production release status is not completed.");
  if (eas.submit?.production?.ios?.ascAppId !== "6772862281") fail("App Store Connect app ID mismatch.");

  if (app.android?.package !== "com.letsgo.ride") fail("Android package ID mismatch.");
  if (app.ios?.bundleIdentifier !== "co.zw.letsgoride") fail("iOS bundle ID mismatch.");
  if (app.extra?.eas?.projectId !== EXPECTED_PROJECT_ID) fail("EAS project ID mismatch.");
  if (app.runtimeVersion?.policy !== "fingerprint") fail("Runtime version policy must remain fingerprint-based.");
  if (app.updates?.url !== EXPECTED_UPDATE_URL) fail("Expo Updates project URL mismatch.");

  return true;
}

if (require.main === module) {
  try {
    verifyProductionReleaseConfig();
    console.log("Verified LetsGoRide production release configuration.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  EXPECTED_PRODUCTION_ENV,
  EXPECTED_PROJECT_ID,
  EXPECTED_UPDATE_URL,
  verifyProductionReleaseConfig,
};
