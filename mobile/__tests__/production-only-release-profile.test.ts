const eas = require("../eas.json");

describe("production-only native release profile", () => {
  it("has no development, preview, staging, or TestFlight build path", () => {
    expect(Object.keys(eas.build)).toEqual(["production"]);
    expect(eas.build.development).toBeUndefined();
    expect(eas.build.preview).toBeUndefined();
    expect(eas.build.testflight).toBeUndefined();
  });

  it("targets only the live production API and public store release paths", () => {
    expect(eas.build.production.env.EXPO_PUBLIC_API_BASE_URL).toBe(
      "https://letsgoride-v2-production.onrender.com",
    );
    expect(eas.build.production.android.buildType).toBe("app-bundle");
    expect(eas.submit.production.android.track).toBe("production");
    expect(eas.submit.production.android.releaseStatus).toBe("completed");
    expect(eas.submit.production.ios.ascAppId).toBe("6772862281");
  });
});
