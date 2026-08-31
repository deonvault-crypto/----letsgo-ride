import { readFileSync } from "fs";
import { resolve } from "path";

const source = readFileSync(resolve(__dirname, "../components/hailing/RideClassCar.tsx"), "utf8");

describe("Ride Now service-class vehicle art", () => {
  it("bundles distinct premium static assets for Economy, Comfort and XL", () => {
    expect(source).toMatch(/ride-economy\.png/);
    expect(source).toMatch(/ride-comfort\.png/);
    expect(source).toMatch(/ride-xl\.png/);
    expect(source).toMatch(/resizeMode="contain"/);
    expect(source).toMatch(/selectedGlow/);
  });

  it("retains stable test IDs and accessibility-safe decorative rendering", () => {
    expect(source).toMatch(/ride-class-car-/);
    expect(source).toMatch(/importantForAccessibility="no-hide-descendants"/);
  });
});
