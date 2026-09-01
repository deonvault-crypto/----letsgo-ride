import fs from "fs";
import path from "path";

const mobileRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(mobileRoot, "..");
const readMobile = (relative: string) => fs.readFileSync(path.join(mobileRoot, relative), "utf8");
const readRepo = (relative: string) => fs.readFileSync(path.join(repoRoot, relative), "utf8");

describe("production hardening final contract", () => {
  it("exposes one production EAS build and submit contract", () => {
    const eas = JSON.parse(readMobile("eas.json"));
    expect(Object.keys(eas.build)).toEqual(["production"]);
    expect(eas.build.production.env.EXPO_PUBLIC_API_BASE_URL).toBe("https://letsgoride-v2-production.onrender.com");
    expect(eas.build.production.autoIncrement).toBe(true);
    expect(eas.build.production.android.buildType).toBe("app-bundle");
    expect(eas.submit.production.android.track).toBe("production");
    expect(eas.submit.production.android.releaseStatus).toBe("completed");
    expect(eas.submit.production.ios.ascAppId).toBe("6772862281");
  });

  it("persists critical workflow mutations and reconciles them after realtime recovery", () => {
    const outbox = readMobile("services/criticalMutationOutbox.ts");
    expect(outbox).toContain("expo-secure-store");
    expect(outbox).toContain("Persist intent before sending it");
    expect(outbox).toContain("alreadyApplied");
    expect(outbox).toContain("flushCriticalMutationOutbox");
    expect(outbox).toContain("clearCriticalMutationOutbox");

    const realtime = readMobile("contexts/RealtimeContext.tsx");
    expect(realtime).toContain("flushCriticalMutationOutbox");
    expect(realtime).toContain("clearCriticalMutationOutbox");

    const courier = readMobile("services/courierService.ts");
    expect(courier).toContain("executeCriticalMutation");
    expect(courier).toContain("courier-handoff");

    const hailing = readMobile("services/hailingService.ts");
    expect(hailing).toContain("hailing-arrived");
    expect(hailing).toContain("hailing-start");
    expect(hailing).toContain("hailing-complete");
  });

  it("fails closed on the wrong Stripe account or settlement currency", () => {
    const guard = readRepo("backend/app/services/stripe_runtime_guard.py");
    expect(guard).toContain("Configured Stripe secret does not belong to the approved LetsGoRide account.");
    expect(guard).toContain("Production Stripe currency must be USD.");
    expect(readRepo("backend/app/main.py")).toContain("await ensure_stripe_runtime_binding()");

    const settlement = readRepo("backend/app/services/driver_settlement_payment_service.py");
    expect(settlement).toContain('SETTLEMENT_CURRENCY = "usd"');
    expect(settlement).toContain('"currency": SETTLEMENT_CURRENCY');
  });
});
