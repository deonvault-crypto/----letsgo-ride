import { readFileSync } from "fs";
import { resolve } from "path";

const walletSource = readFileSync(resolve(__dirname, "../app/(shared)/wallet.tsx"), "utf8");
const driverSettlementSource = readFileSync(
  resolve(__dirname, "../components/finance/DriverSettlementWallet.tsx"),
  "utf8",
);

describe("driver wallet policy", () => {
  it("routes drivers into the dedicated weekly settlement wallet", () => {
    expect(walletSource).toMatch(/wallet\?\.worker_role === "driver"/i);
    expect(walletSource).toMatch(/DriverSettlementWallet/i);
  });

  it("explains the approved earn-first weekly postpaid policy", () => {
    expect(driverSettlementSource).toMatch(/Earn first\. Settle once a week\./i);
    expect(driverSettlementSource).toMatch(/Passengers pay you directly/i);
    expect(driverSettlementSource).toMatch(/7-day earning period/i);
    expect(driverSettlementSource).toMatch(/Settle balance/i);
  });

  it("does not restore the superseded card-only cash-fee policy", () => {
    expect(driverSettlementSource).not.toMatch(/Cash fares are 100% yours/i);
    expect(driverSettlementSource).not.toMatch(/platform fee from successfully settled card rides/i);
    expect(driverSettlementSource).not.toMatch(/Card platform fee/i);
  });
});
