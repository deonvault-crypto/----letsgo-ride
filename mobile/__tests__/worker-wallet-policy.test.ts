import { readFileSync } from "fs";
import { resolve } from "path";

const walletSource = readFileSync(resolve(__dirname, "../app/(shared)/wallet.tsx"), "utf8");
const walletBackend = readFileSync(resolve(__dirname, "../../backend/app/services/worker_wallet_service.py"), "utf8");
const settlementBackend = readFileSync(resolve(__dirname, "../../backend/app/services/driver_weekly_settlement_service.py"), "utf8");

describe("driver weekly settlement policy", () => {
  it("lets drivers earn first and only exposes settlement after a weekly statement is due", () => {
    expect(walletSource).toMatch(/Earn first\. Settle weekly\./i);
    expect(walletSource).toContain("wallet.driver_settlement.can_settle");
    expect(walletSource).toMatch(/Settle balance/i);
    expect(walletSource).toMatch(/Only completed weekly statements become payable/i);
  });

  it("keeps cash with the driver while accruing the exact completed-ride service fee", () => {
    expect(walletSource).toMatch(/Passenger pays you directly\. You keep the cash and settle LetsGoRide weekly\./i);
    expect(walletBackend).toContain('"platform_fee_policy": "weekly_postpaid"');
    expect(settlementBackend).toContain('if str(trip.get("status") or "") != "COMPLETED"');
    expect(settlementBackend).toContain('fee = _money(fare.get("platform_commission"))');
  });

  it("blocks only new Ride Now work after the weekly balance becomes overdue", () => {
    expect(settlementBackend).toContain('if summary["ride_now_blocked"]');
    expect(settlementBackend).toContain("Settle it in Wallet to receive new Ride Now requests");
  });
});
