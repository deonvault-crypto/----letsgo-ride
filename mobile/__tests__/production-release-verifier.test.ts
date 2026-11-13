const {
  EXPECTED_PRODUCTION_ENV,
  EXPECTED_PROJECT_ID,
  EXPECTED_UPDATE_URL,
  verifyProductionReleaseConfig,
} = require("../scripts/verify-production-release-config");

describe("canonical production release configuration", () => {
  it("matches the reviewed production contract", () => {
    expect(verifyProductionReleaseConfig()).toBe(true);
    expect(EXPECTED_PROJECT_ID).toBe("6a3f6705-1e96-4f17-b884-b928baebf0ba");
    expect(EXPECTED_UPDATE_URL).toBe(`https://u.expo.dev/${EXPECTED_PROJECT_ID}`);
    expect(EXPECTED_PRODUCTION_ENV).toEqual({
      EXPO_PUBLIC_API_BASE_URL: "https://letsgoride-v2-production.onrender.com",
      EXPO_PUBLIC_ENABLE_AUTHENTICATED_WEB: "false",
    });
  });
});
