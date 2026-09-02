const path = require("path");

module.exports = ({ config }) => {
  // Generate small original notification WAV assets before Expo applies native
  // notification plugins or EAS packages the project. This keeps the sounds
  // deterministic and avoids shipping third-party/copyrighted ringtone assets.
  require(path.resolve(__dirname, "scripts/generate-notification-sounds.js"));

  // react-native-maps on Android requires the Google Maps SDK key to be written
  // into AndroidManifest.xml at build time. The production EAS environment
  // already provides this value and validate-build-env.js requires it; wire that
  // existing secret into Expo's native Android map configuration.
  const googleMapsAndroidApiKey = String(process.env.GOOGLE_MAPS_ANDROID_API_KEY || "").trim();
  const googleServicesFile = String(process.env.GOOGLE_SERVICES_JSON || "").trim();
  const androidConfig = { ...(config.android?.config || {}) };

  if (googleMapsAndroidApiKey) {
    androidConfig.googleMaps = {
      ...(androidConfig.googleMaps || {}),
      apiKey: googleMapsAndroidApiKey,
    };
  }

  return {
    ...config,
    android: {
      ...config.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
      config: androidConfig,
    },
  };
};
