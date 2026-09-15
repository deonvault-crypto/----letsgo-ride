module.exports = ({ config }) => {
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
