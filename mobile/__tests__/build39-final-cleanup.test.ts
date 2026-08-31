import fs from "fs";
import path from "path";

const root = path.resolve(__dirname, "..");
const readSource = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("Build 39 final cleanup contract", () => {
  it("routes Customer Ride only into Ride Now", () => {
    const source = readSource("app/(shared)/services.tsx");
    expect(source).toContain("flow=hailing");
    expect(source).not.toContain("/(customer)/search");
    expect(source).not.toContain("city-to-city");
  });

  it("keeps Driver verification to selfie, identity and licence", () => {
    const source = readSource("app/(shared)/verification.tsx");
    expect(source).not.toContain("vehicle_registration_or_logbook");
    expect(source).not.toContain("vehicle record");
    expect(source).toContain("driver_license");
  });

  it("uses a Reduce-Motion-aware nearby-driver radar", () => {
    const source = readSource("app/(customer)/hail/searching.tsx");
    expect(source).toContain("DriverSearchRadar");
    expect(source).toContain("AccessibilityInfo");
    expect(source).toContain('activeTone="neutral"');
  });

  it("wires profile-photo approval into Admin", () => {
    const source = readSource("components/admin/AdminControlCenter.tsx");
    expect(source).toContain("listAdminProfilePhotos");
    expect(source).toContain("ProfilePhotoList");
    expect(source).toContain("Approve photo");
  });

  it("ships the transparent Comfort production asset", () => {
    const png = fs.readFileSync(path.join(root, "assets/images/hailing/ride-comfort.png"));
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(png.readUInt32BE(16)).toBe(320);
    expect(png.readUInt32BE(20)).toBe(180);
    expect(png.includes(Buffer.from("tRNS"))).toBe(true);
    expect(png.length).toBeLessThan(100_000);
  });
});
