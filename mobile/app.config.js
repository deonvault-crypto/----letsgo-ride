module.exports = ({ config }) => {
  const googleMapsApiKey = String(process.env.GOOGLE_MAPS_ANDROID_API_KEY || "").trim();
  const googleServicesFile = String(process.env.GOOGLE_SERVICES_JSON || "").trim();

  return {
    ...config,
    android: {
      ...config.android,
      ...(googleMapsApiKey
        ? {
            config: {
              ...(config.android?.config || {}),
              googleMaps: { apiKey: googleMapsApiKey },
            },
          }
        : {}),
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
  };
};
