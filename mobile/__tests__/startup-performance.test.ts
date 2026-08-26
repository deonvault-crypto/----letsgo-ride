import fs from "fs";
import path from "path";

const root = path.resolve(__dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("startup performance architecture", () => {
  it("bounds the branded launch and supports reduced motion", () => {
    const source = read("app/index.tsx");
    expect(source).toContain("STANDARD_LAUNCH_MS = 1900");
    expect(source).toContain("REDUCED_MOTION_LAUNCH_MS = 650");
    expect(source).toContain("AccessibilityInfo.isReduceMotionEnabled");
    expect(source).not.toContain("loadingTrack");
  });

  it("defers realtime, notification snapshots, and permission inspection until after the index route", () => {
    expect(read("contexts/RealtimeContext.tsx")).toContain('pathname === "/"');
    expect(read("contexts/NotificationContext.tsx")).toContain('pathname === "/"');
    expect(read("components/permissions/PermissionReminder.tsx")).toContain('pathname === "/"');
  });

  it("keeps Ride discovery timer-free and the Home first-load state compact", () => {
    const rides = read("hooks/useRides.ts");
    const home = read("app/(customer)/home.tsx");
    expect(rides).not.toContain("setInterval(");
    expect(rides).not.toContain("useLiveRefresh");
    expect(home).toContain("upcoming-rides-skeleton");
    expect(home).toContain("AppNotice");
    expect(home).not.toContain("Finding rides...");
  });
});
