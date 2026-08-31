import fs from "fs";
import path from "path";

const root = path.resolve(__dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("startup performance architecture", () => {
  it("keeps the branded launch short and supports reduced motion", () => {
    const source = read("app/index.tsx");
    expect(source).toContain("STANDARD_LAUNCH_MS = 1250");
    expect(source).toContain("REDUCED_MOTION_LAUNCH_MS = 350");
    expect(source).toContain("AccessibilityInfo.isReduceMotionEnabled");
    expect(source).not.toContain("ActivityIndicator");
  });

  it("uses a premium lightweight route cue without the old cartoon rider scene", () => {
    const source = read("app/index.tsx");
    expect(source).toContain("routeStage");
    expect(source).toContain("vehiclePoint");
    expect(source).toContain("MOVE · EAT · SEND");
    expect(source).not.toContain("ScooterIllustration");
    expect(source).not.toContain("deliveryBox");
    expect(source).not.toContain("riderTorso");
    expect(source).not.toContain("require(");
  });

  it("defers realtime, notification snapshots, and permission inspection until after the index route", () => {
    expect(read("contexts/RealtimeContext.tsx")).toContain('pathname === "/"');
    expect(read("contexts/NotificationContext.tsx")).toContain('pathname === "/"');
    expect(read("components/permissions/PermissionReminder.tsx")).toContain('pathname === "/"');
  });

  it("keeps Ride discovery timer-free and the Fluid Canvas first-load state compact", () => {
    const rides = read("hooks/useRides.ts");
    const home = read("app/(customer)/home.tsx");
    expect(rides).not.toContain("setInterval(");
    expect(rides).not.toContain("useLiveRefresh");
    expect(home).toContain("HailingMapBackdrop");
    expect(home).toContain('title: "Where to?"');
    expect(home).toContain("Checking available trips…");
    expect(home).not.toContain("upcoming-rides-skeleton");
    expect(home).not.toContain("Finding rides...");
    expect(home).not.toContain("ScrollView");
  });
});
