const eas = require("../eas.json");

describe("TestFlight production release profile", () => {
  it("ships TestFlight and production builds against the production API while keeping staging out of release profiles", () => {
    const productionOrigin = "https://letsgoride-v2-production.onrender.com";
    const stagingOrigin = "https://letsgoride-v2-staging.onrender.com";

    expect(eas.build.testflight.env.EXPO_PUBLIC_API_BASE_URL).toBe(productionOrigin);
    expect(eas.build.testflight.autoIncrement).toBe(true);
    expect(eas.build.testflight.distribution).toBeUndefined();
    expect(eas.build.production.env.EXPO_PUBLIC_API_BASE_URL).toBe(productionOrigin);

    expect(eas.build.testflight.env.EXPO_PUBLIC_API_BASE_URL).not.toBe(stagingOrigin);
    expect(eas.build.production.env.EXPO_PUBLIC_API_BASE_URL).not.toBe(stagingOrigin);
    expect(eas.submit.production.ios.ascAppId).toBe("6772862281");
  });
});
