import { readFileSync } from "fs";
import { resolve } from "path";

const driverRideNow = readFileSync(resolve(__dirname, "../app/(driver)/hailing.tsx"), "utf8");

describe("Driver Ride Now earnings copy", () => {
  it("shows a single earnings truth instead of the old estimated-net wording", () => {
    expect(driverRideNow).toContain('label="Earnings"');
    expect(driverRideNow).not.toContain('label="Est. net"');
  });
});
