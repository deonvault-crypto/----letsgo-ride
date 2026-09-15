import fs from "fs";
import path from "path";

const root = path.resolve(__dirname, "..");

describe("admin profile-photo and Ride asset contracts", () => {
  it("keeps profile-photo approval wired into Admin until behavioral coverage replaces this static guard", () => {
    const source = fs.readFileSync(path.join(root, "components/admin/AdminControlCenter.tsx"), "utf8");
    expect(source).toContain("listAdminProfilePhotos");
    expect(source).toContain("ProfilePhotoList");
    expect(source).toContain("Approve photo");
  });

  it("ships the transparent Comfort production asset", () => {
    const png = fs.readFileSync(path.join(root, "assets/images/hailing/ride-comfort.png"));
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(png.readUInt32BE(16)).toBe(320);
    expect(png.readUInt32BE(20)).toBe(180);
    const colorType = png[25];
    const hasAlphaChannel = colorType === 4 || colorType === 6;
    const hasTransparencyChunk = png.includes(Buffer.from("tRNS"));
    expect(hasAlphaChannel || hasTransparencyChunk).toBe(true);
    expect(png.length).toBeLessThan(100_000);
  });
});
