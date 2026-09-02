const baseConfig = require("../app.json").expo;
const resolveAppConfig = require("../app.config.js");

describe("Android push build configuration", () => {
  it("wires the existing EAS Firebase file without disturbing the Maps key", () => {
    const previousMapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
    const previousGoogleServices = process.env.GOOGLE_SERVICES_JSON;

    process.env.GOOGLE_MAPS_ANDROID_API_KEY = "test-maps-key";
    process.env.GOOGLE_SERVICES_JSON = "/tmp/google-services.json";

    try {
      const resolved = resolveAppConfig({ config: baseConfig });

      expect(resolved.android.googleServicesFile).toBe("/tmp/google-services.json");
      expect(resolved.android.config.googleMaps.apiKey).toBe("test-maps-key");
      expect(resolved.android.package).toBe("com.letsgo.ride");
    } finally {
      if (previousMapsKey === undefined) delete process.env.GOOGLE_MAPS_ANDROID_API_KEY;
      else process.env.GOOGLE_MAPS_ANDROID_API_KEY = previousMapsKey;

      if (previousGoogleServices === undefined) delete process.env.GOOGLE_SERVICES_JSON;
      else process.env.GOOGLE_SERVICES_JSON = previousGoogleServices;
    }
  });
});
