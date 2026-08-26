import { execFileSync } from "child_process";
import { resolve } from "path";

const appConfig = require("../app.json").expo;
const easConfig = require("../eas.json");
const validator = resolve(__dirname, "../scripts/validate-build-env.js");

function validate(profile: string, apiBaseUrl: string) {
  return () => execFileSync(process.execPath, [validator], {
    env: {
      ...process.env,
      EAS_BUILD_PROFILE: profile,
      EXPO_PUBLIC_API_BASE_URL: apiBaseUrl,
    },
    stdio: "pipe",
  });
}

describe("production release configuration", () => {
  it("keeps the existing Store identities and uses the V2 production origin", () => {
    expect(appConfig.ios.bundleIdentifier).toBe("co.zw.letsgoride");
    expect(appConfig.android.package).toBe("com.letsgo.ride");
    expect(appConfig.version).toBe("2.0.0");
    expect(easConfig.build.production.env.EXPO_PUBLIC_API_BASE_URL).toBe(
      "https://letsgoride-v2-production.onrender.com",
    );
  });

  it("rejects legacy, staging, credentialed, and path-scoped production API URLs", () => {
    expect(validate("production", "https://letsgoride-v2-production.onrender.com")).not.toThrow();
    expect(validate("production", "https://letsgoride-backend.onrender.com")).toThrow();
    expect(validate("production", "https://letsgoride-v2-staging.onrender.com")).toThrow();
    expect(validate("production", "https://user:secret@letsgoride-v2-production.onrender.com")).toThrow();
    expect(validate("production", "https://letsgoride-v2-production.onrender.com/private")).toThrow();
  });

  it("does not declare unused microphone, background-location, or broad storage access", () => {
    const imagePicker = appConfig.plugins.find((plugin: unknown) => Array.isArray(plugin) && plugin[0] === "expo-image-picker");
    const location = appConfig.plugins.find((plugin: unknown) => Array.isArray(plugin) && plugin[0] === "expo-location");
    expect(imagePicker[1].microphonePermission).toBe(false);
    expect(location[1].isIosBackgroundLocationEnabled).toBe(false);
    expect(location[1].isAndroidBackgroundLocationEnabled).toBe(false);
    expect(appConfig.android.blockedPermissions).toEqual(expect.arrayContaining([
      "android.permission.RECORD_AUDIO",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
    ]));
    expect(appConfig.ios.infoPlist.NSAppTransportSecurity.NSAllowsArbitraryLoads).toBe(false);
  });
});
