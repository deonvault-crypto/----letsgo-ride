import fs from "fs";
import path from "path";

const read = (relativePath: string) => fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");

describe("Driver intercity product labeling", () => {
  it("keeps scheduled intercity surfaces distinct from Ride Now", () => {
    expect(read("components/layout/BottomNav.tsx")).toContain('label: "Intercity"');
    expect(read("app/(driver)/post-trip.tsx")).toContain('title="Post intercity ride"');
    expect(read("app/(driver)/post-trip.tsx")).toContain("INTERCITY RIDE");
    expect(read("app/(driver)/trips.tsx")).toContain('title="Intercity trips"');
    expect(read("app/(driver)/trips.tsx")).toContain("kept separate from Ride Now");
    expect(read("app/(driver)/availability.tsx")).toContain('title="Intercity calendar"');
    expect(read("app/(driver)/availability.tsx")).toContain("INTERCITY CALENDAR");
  });
});
