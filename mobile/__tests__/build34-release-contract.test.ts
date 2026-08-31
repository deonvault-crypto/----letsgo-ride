import fs from "fs";
import path from "path";

const mobileRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(mobileRoot, "..");
const readMobile = (relative: string) => fs.readFileSync(path.join(mobileRoot, relative), "utf8");
const readRepo = (relative: string) => fs.readFileSync(path.join(repoRoot, relative), "utf8");

describe("Build 34 release recovery contract", () => {
  it("keeps Ride Now map-first and realtime recovery", () => {
    expect(readMobile("app/(driver)/hailing.tsx")).toContain("HailingMapBackdrop");
    expect(readMobile("app/(driver)/hailing/trip/[id].tsx")).toContain("HailingMapBackdrop");
    const hook = readMobile("hooks/useHailing.ts");
    expect(hook).toContain("CONNECTED_RECONCILIATION_MS = 15000");
    expect(hook).toContain("RECOVERY_REFRESH_MS = 6500");
    expect(hook).toContain('event.resource_type === "hailing_offer" || event.resource_type === "hailing_trip"');
  });

  it("restores passenger, driver and courier active jobs once at cold start", () => {
    const layout = readMobile("app/_layout.tsx");
    expect(layout).toContain("function ActiveJobRecoveryRouter()");
    expect(layout).toContain('["passenger", "driver", "courier"]');
    expect(layout).toContain("getActiveHailingTrip");
    expect(layout).toContain("getHailingDriverStatus");
    expect(layout).toContain("getActiveCourierDelivery");
  });

  it("never hardcodes cash on a card hailing trip", () => {
    expect(readMobile("app/(customer)/hail/trip/[id].tsx")).toContain('trip.payment_method === "card" ? "Card fare" : "Cash fare"');
    expect(readMobile("app/(driver)/hailing/trip/[id].tsx")).toContain('trip.payment_method === "card" ? "Card" : "Cash"');
  });

  it("keeps cash driver economics at 100 percent and platform fee card-only", () => {
    const wallet = readRepo("backend/app/services/worker_wallet_service.py");
    expect(wallet).toContain('"cash_policy": "driver_keeps_100_percent"');
    expect(wallet).toContain('"platform_fee_policy": "card_only"');
    expect(wallet).toContain('"amount_due_to_platform_usd": 0.0');
  });

  it("registers courier background tracking only around active deliveries", () => {
    const service = readMobile("services/courierBackgroundLocation.ts");
    expect(service).toContain("COURIER_BACKGROUND_TASK");
    expect(service).toContain("startCourierBackgroundDeliveryTracking");
    const layout = readMobile("app/(courier)/_layout.tsx");
    expect(layout).toContain("CourierLocationSync");
    expect(layout).toContain("CourierBackgroundLocationPrompt");
  });
});
