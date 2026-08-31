import fs from "fs";
import path from "path";

const repoRoot = path.resolve(__dirname, "..", "..");

function read(relative: string) {
  return fs.readFileSync(path.join(repoRoot, relative), "utf8");
}

describe("driver weekly postpaid settlement", () => {
  it("shows an exact server-owned Stripe settlement only when a balance is due", () => {
    const component = read("mobile/components/finance/DriverSettlementWallet.tsx");
    const service = read("mobile/services/workerFinanceService.ts");

    expect(component).toContain("wallet.settlement_button_visible === true");
    expect(component).toContain("Settle balance · ${money(due)}");
    expect(component).toContain("createDriverFeeSettlementIntent()");
    expect(component).toContain("paymentIntentClientSecret: intent.client_secret");
    expect(component).toContain("confirmDriverFeeSettlement()");
    expect(component).not.toContain("amount_usd:");
    expect(service).toContain('/payments/driver-fees/stripe/intent');
    expect(service).toContain('/payments/driver-fees/stripe/confirm');
  });

  it("keeps driver wallet separate from courier payout-method UI", () => {
    const wallet = read("mobile/app/(shared)/wallet.tsx");
    expect(wallet).toContain('wallet?.worker_role === "driver"');
    expect(wallet).toContain("<DriverSettlementWallet");
  });

  it("removes passenger card checkout from Ride Now launch config", () => {
    const payments = read("backend/app/routers/payments.py");
    expect(payments).toContain('"card_enabled": False');
    expect(payments).toContain('"driver_fee_settlement_enabled": bool(settings.stripe_configured)');
  });
});
