import { readFileSync } from "fs";
import { resolve } from "path";

const source = readFileSync(resolve(__dirname, "../components/hailing/RideClassCar.tsx"), "utf8");

describe("Ride Now service-class vehicle art", () => {
  it("keeps distinct Economy, Comfort and XL production geometry", () => {
    expect(source).toMatch(/ECONOMY:/);
    expect(source).toMatch(/COMFORT:/);
    expect(source).toMatch(/XL:/);
    expect(source).toMatch(/roofWidth/);
    expect(source).toMatch(/doorHandleFront/);
  });

  it("retains stable test IDs and accessibility-safe decorative rendering", () => {
    expect(source).toMatch(/ride-class-car-/);
    expect(source).toMatch(/importantForAccessibility="no-hide-descendants"/);
  });
});
