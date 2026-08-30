import fs from "fs";
import path from "path";

const root = path.join(__dirname, "..");

describe("production release configuration", () => {
  it("keeps the production mobile identity and API target explicit", () => {
    const app = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8")).expo;
    const eas = JSON.parse(fs.readFileSync(path.join(root, "eas.json"), "utf8"));

    expect(app.version).toBe("2.0.2");
    expect(app.ios.bundleIdentifier).toBe("co.zw.letsgoride");
    expect(app.android.package).toBe("com.letsgo.ride");
    expect(app.android.allowBackup).toBe(false);
    expect(eas.build.production.env.EXPO_PUBLIC_API_BASE_URL).toBe("https://letsgoride-v2-production.onrender.com");
    expect(eas.build.preview.env.EXPO_PUBLIC_API_BASE_URL).toBe("https://letsgoride-v2-staging.onrender.com");
  });

  it("does not request broad Android storage, contacts, audio, or background location permissions", () => {
    const app = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8")).expo;
    const permissions = app.android.permissions;
    expect(permissions).toEqual(expect.arrayContaining([
      "android.permission.CAMERA",
      "android.permission.ACCESS_COARSE_LOCATION",
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.POST_NOTIFICATIONS",
    ]));
    for (const permission of [
      "android.permission.ACCESS_BACKGROUND_LOCATION",
      "android.permission.READ_CONTACTS",
      "android.permission.WRITE_CONTACTS",
      "android.permission.RECORD_AUDIO",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
      "android.permission.RECEIVE_BOOT_COMPLETED",
      "android.permission.SYSTEM_ALERT_WINDOW",
      "android.permission.USE_FINGERPRINT",
    ]) {
      expect(permissions).not.toContain(permission);
    }
  });
});
