const eas = require("../eas.json");

describe("TestFlight staging release profile", () => {
  it("ships TestFlight QA against staging without weakening the production profile", () => {
    expect(eas.build.testflight.env.EXPO_PUBLIC_API_BASE_URL).toBe("https://letsgoride-v2-staging.onrender.com");
    expect(eas.build.testflight.autoIncrement).toBe(true);
    expect(eas.build.testflight.distribution).toBeUndefined();
    expect(eas.build.production.env.EXPO_PUBLIC_API_BASE_URL).toBe("https://letsgoride-v2-production.onrender.com");
    expect(eas.submit.production.ios.ascAppId).toBe("6772862281");
  });
});
