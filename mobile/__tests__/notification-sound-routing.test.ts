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

  it("bundles three original LetsGoRide sounds during native builds", () => {
    expect(appConfig).toContain("generate-notification-sounds.js");
    expect(generator).toContain('"letsgoride_notification.wav"');
    expect(generator).toContain('"letsgoride_ride_request.wav"');
    expect(generator).toContain('"letsgoride_courier_request.wav"');
    expect(appJson).toContain("./assets/sounds/letsgoride_notification.wav");
    expect(appJson).toContain("./assets/sounds/letsgoride_ride_request.wav");
    expect(appJson).toContain("./assets/sounds/letsgoride_courier_request.wav");
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
