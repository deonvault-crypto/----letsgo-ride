import crypto from "crypto";
import fs from "fs";
import path from "path";

describe("LetsGoRide notification sound routing", () => {
  const mobileRoot = path.resolve(__dirname, "..");
  const repoRoot = path.resolve(mobileRoot, "..");
  const appJson = fs.readFileSync(path.join(mobileRoot, "app.json"), "utf8");
  const appConfig = fs.readFileSync(path.join(mobileRoot, "app.config.js"), "utf8");
  const generator = fs.readFileSync(path.join(mobileRoot, "scripts/generate-notification-sounds.js"), "utf8");
  const pushService = fs.readFileSync(path.join(mobileRoot, "services/pushNotificationService.ts"), "utf8");
  const backendNotifications = fs.readFileSync(path.join(repoRoot, "backend/app/services/notification_service.py"), "utf8");
  const courierOffers = fs.readFileSync(path.join(repoRoot, "backend/app/services/courier_offer_realtime_service.py"), "utf8");

  it("bundles three committed original LetsGoRide sounds without config-time filesystem writes", () => {
    const soundAssets: Record<string, { sha256: string; bytes: number }> = {
      "letsgoride_notification.wav": {
        sha256: "6fa6a8261426ce2ee9e440ea3fbdac1e72356bc365b18c19c568ca87c77a354d",
        bytes: 31_796,
      },
      "letsgoride_ride_request.wav": {
        sha256: "3125d56277631803dcc11d18788c725f30c6c6763e9a1ff7d58f12f413a3811e",
        bytes: 78_542,
      },
      "letsgoride_courier_request.wav": {
        sha256: "c84ab4da43695325da5cc5cbb8224af8061ef6acdc28945d3324ba2eda3db428",
        bytes: 78_542,
      },
    };

    expect(appConfig).not.toContain("generate-notification-sounds.js");
    expect(generator).toContain('"letsgoride_notification.wav"');
    expect(generator).toContain('"letsgoride_ride_request.wav"');
    expect(generator).toContain('"letsgoride_courier_request.wav"');

    for (const [fileName, expected] of Object.entries(soundAssets)) {
      const assetPath = path.join(mobileRoot, "assets", "sounds", fileName);
      const wav = fs.readFileSync(assetPath);
      expect(wav.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(wav.subarray(8, 12).toString("ascii")).toBe("WAVE");
      expect(wav.length).toBe(expected.bytes);
      expect(crypto.createHash("sha256").update(wav).digest("hex")).toBe(expected.sha256);
      expect(appJson).toContain(`./assets/sounds/${fileName}`);
    }
  });

  it("uses separate high-priority Android channels for general, Ride and Courier alerts", () => {
    expect(pushService).toContain('ANDROID_GENERAL_CHANNEL_ID = "general_v1"');
    expect(pushService).toContain('ANDROID_RIDE_REQUEST_CHANNEL_ID = "ride_requests_v1"');
    expect(pushService).toContain('ANDROID_COURIER_REQUEST_CHANNEL_ID = "courier_requests_v1"');
    expect(pushService).toContain("AndroidImportance.MAX");
    expect(pushService).toContain("shouldPlaySound: true");
    expect(pushService).toContain("RIDE_REQUEST_SOUND");
    expect(pushService).toContain("COURIER_REQUEST_SOUND");
  });

  it("routes backend pushes to the matching sound instead of one generic channel", () => {
    expect(backendNotifications).toContain('target == "hailing_driver_offer"');
    expect(backendNotifications).toContain('"channel_id": RIDE_REQUEST_CHANNEL_ID');
    expect(backendNotifications).toContain('target in {"courier_offer", "courier_delivery_offer"}');
    expect(backendNotifications).toContain('"channel_id": COURIER_REQUEST_CHANNEL_ID');
    expect(backendNotifications).toContain('"channelId": push_profile["channel_id"]');
    expect(backendNotifications).toContain('"sound": push_profile["sound"]');
  });

  it("pushes a new Courier offer only when it first becomes available", () => {
    expect(courierOffers).toContain('event_type = "courier_offer.available"');
    expect(courierOffers).toContain('if event_type == "courier_offer.available":');
    expect(courierOffers).toContain('"notification_target": "courier_offer"');
    expect(courierOffers).toContain('"New delivery request"');
  });

  it("does not silently enable unrestricted Android draw-over-other-apps permission", () => {
    expect(appJson).toContain('"android.permission.SYSTEM_ALERT_WINDOW"');
    expect(appJson).toContain('"blockedPermissions"');
  });
});
