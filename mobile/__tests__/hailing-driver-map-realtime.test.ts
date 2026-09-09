import fs from "fs";
import path from "path";

import { resolveNotificationRoute } from "../services/notificationRouting";

const root = path.resolve(__dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("Ride Now Driver map-first realtime contracts", () => {
  it("keeps the map as the primary Driver workspace and trip surface", () => {
    const workspace = read("app/(driver)/hailing.tsx");
    const trip = read("app/(driver)/hailing/trip/[id].tsx");

    expect(workspace).toContain("<HailingMapBackdrop");
    expect(workspace).toContain("NEW RIDE REQUEST");
    expect(workspace).toContain("ONLINE · LIVE");
    expect(trip).toContain("<HailingMapBackdrop");
    expect(trip).toContain("Open navigation");
    expect(trip).toContain("I’ve arrived");
    expect(trip).toContain("Start trip");
    expect(trip).not.toContain("Passenger confirmed boarding");
  });

  it("uses WebSocket events as the primary Ride Now update path with recovery polling only", () => {
    const hooks = read("hooks/useHailing.ts");

    expect(hooks).toContain('event.resource_type === "hailing_offer"');
    expect(hooks).toContain('event.resource_type === "hailing_trip"');
    expect(hooks).toContain('connectionState === "connected"');
    expect(hooks).toContain("RECOVERY_REFRESH_MS");
    expect(hooks).not.toContain("4500");
  });

  it("uses one authoritative foreground GPS watcher while keeping live Driver map updates", () => {
    const workspace = read("app/(driver)/hailing.tsx");
    const trip = read("app/(driver)/hailing/trip/[id].tsx");
    const coordinator = read("components/hailing/HailingDriverLocationSync.tsx");
    const sync = read("hooks/useHailingDriverLocationSync.ts");

    expect(workspace).toContain("useHailingDriverLocationSync");
    expect(trip).toContain("useHailingDriverLocationSync");
    expect(coordinator).toContain("updateHailingDriverPresence");
    expect(coordinator).toContain("updateHailingTripLocation");
    expect(coordinator).toContain("watchForegroundLocation");
    expect(coordinator).toContain("timeInterval: 4000");
    expect(coordinator).toContain("publishHailingDriverLocation");
    expect(sync).toContain("subscribeHailingDriverLocation");
    expect(sync).not.toContain("watchForegroundLocation");
    expect(sync).not.toContain("updateHailingTripLocation");
  });

  it("routes a background Ride Now offer notification directly to the Driver map workspace", () => {
    expect(resolveNotificationRoute({
      role: "driver",
      data: { notification_target: "hailing_driver_offer", hailing_offer_id: "offer-1", hailing_trip_id: "trip-1" },
    })).toBe("/(driver)/hailing");
  });
});
