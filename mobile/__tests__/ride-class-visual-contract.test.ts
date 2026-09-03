import { readFileSync } from "fs";
import { resolve } from "path";

const source = readFileSync(resolve(__dirname, "../components/hailing/RideClassCar.tsx"), "utf8");

describe("Ride Now service-class vehicle art", () => {
  it("uses the three bundled premium side-profile vehicle assets", () => {
    expect(source).toMatch(/ride-economy\.png/);
    expect(source).toMatch(/ride-comfort\.png/);
    expect(source).toMatch(/ride-xl\.png/);
    expect(source).toMatch(/resizeMode="contain"/);
    expect(source).toMatch(/<Image/);
    expect(source).not.toMatch(/LinearGradient/);
    expect(source).not.toMatch(/bodyWidth/);
  });

  it("retains stable test IDs and accessibility-safe decorative rendering", () => {
    expect(source).toMatch(/ride-class-car-/);
    expect(source).toMatch(/importantForAccessibility="no-hide-descendants"/);
  });

  it("keeps the bundled vehicle art free of decorative selection effects", () => {
    expect(source).not.toMatch(/selectedGlow|shadowColor|shadowOpacity|elevation/);
    expect(source).not.toMatch(/84,199,121/);
  });
});
