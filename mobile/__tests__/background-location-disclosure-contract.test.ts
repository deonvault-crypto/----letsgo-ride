import fs from "fs";
import path from "path";

const root = path.resolve(__dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("background location disclosure contracts", () => {
  it("keeps one shared presentation component for Driver and Courier prompts", () => {
    const driver = read("components/hailing/DriverBackgroundLocationPrompt.tsx");
    const courier = read("components/courier/CourierBackgroundLocationPrompt.tsx");
    const shared = read("components/permissions/BackgroundLocationDisclosureCard.tsx");

    expect(driver).toContain("BackgroundLocationDisclosureCard");
    expect(courier).toContain("BackgroundLocationDisclosureCard");
    expect(driver).not.toContain("StyleSheet.create");
    expect(courier).not.toContain("StyleSheet.create");
    expect(shared).toContain('accessibilityRole="button"');
    expect(shared).toContain("useSafeAreaInsets");
    expect(shared).toContain("Not now");
  });

  it("preserves Driver-specific permission and tracking behavior", () => {
    const driver = read("components/hailing/DriverBackgroundLocationPrompt.tsx");

    expect(driver).toContain("getDriverBackgroundLocationPermissionState");
    expect(driver).toContain("requestDriverBackgroundLocationPermission");
    expect(driver).toContain("startDriverBackgroundTripTracking");
    expect(driver).toContain("ACTIVE RIDE NOW TRIP");
    expect(driver).toContain("Allow while working");
  });

  it("backs off Driver Ride Now location reconciliation when eligibility is rejected", () => {
    const sync = read("components/hailing/HailingDriverLocationSync.tsx");

    expect(sync).toContain('import { ApiRequestError } from "../../services/api"');
    expect(sync).toContain("error instanceof ApiRequestError && error.status === 403");
    expect(sync).toContain("eligibilityBackoff.current = true");
    expect(sync).toContain("eligibilityBackoff.current = false");
    expect(sync).toContain("featureEnabled.current === false || eligibilityBackoff.current");
    expect(sync).toContain("DISABLED_REFRESH_MS");
  });

  it("preserves Courier delivery and online-availability behavior", () => {
    const courier = read("components/courier/CourierBackgroundLocationPrompt.tsx");

    expect(courier).toContain("getCourierBackgroundLocationPermissionState");
    expect(courier).toContain("startCourierBackgroundDeliveryTracking");
    expect(courier).toContain("startCourierBackgroundAvailabilityTracking");
    expect(courier).toContain("stopCourierBackgroundAvailabilityTracking");
    expect(courier).toContain("ACTIVE DELIVERY");
    expect(courier).toContain("COURIER ONLINE");
    expect(courier).toContain("Allow while delivering");
    expect(courier).toContain("Allow while Online");
  });
});
