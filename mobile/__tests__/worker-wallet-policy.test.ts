import { readFileSync } from "fs";
import { resolve } from "path";

const walletSource = readFileSync(resolve(__dirname, "../app/(shared)/wallet.tsx"), "utf8");

describe("driver wallet policy", () => {
  it("never tells a driver they owe LetsGoRide for cash fares", () => {
    expect(walletSource).not.toMatch(/Owed to LetsGoRide/i);
    expect(walletSource).not.toMatch(/Platform amount arising from completed cash work/i);
  });

  it("explains that cash is kept in full and the platform fee is card-only", () => {
    expect(walletSource).toMatch(/Cash fares are 100% yours/i);
    expect(walletSource).toMatch(/platform fee from successfully settled card rides/i);
    expect(walletSource).toMatch(/Card platform fee/i);
  });
});
