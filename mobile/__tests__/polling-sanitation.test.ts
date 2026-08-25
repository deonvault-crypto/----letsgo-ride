import fs from "fs";
import path from "path";

const root = path.resolve(__dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("Phase 8 recurring polling sanitation", () => {
  const migrated = [
    "app/(shared)/activity.tsx",
    "hooks/useRides.ts",
    "app/(shared)/account.tsx",
    "app/(shared)/verification.tsx",
    "app/(shared)/support.tsx",
    "app/(shared)/report.tsx",
    "app/(admin)/dashboard.tsx",
    "app/(admin)/verifications.tsx",
    "app/(admin)/verification/[id].tsx",
  ];

  it.each(migrated)("%s has no recurring live-refresh consumer", (file) => {
    expect(read(file)).not.toContain("useLiveRefresh");
    expect(read(file)).not.toContain("setInterval(");
  });

  it("uses one Activity read-model request and SessionContext guest truth", () => {
    const source = read("app/(shared)/activity.tsx");
    expect(source).toContain("getActivitySnapshot");
    expect(source).toContain("useSession");
    expect(source).not.toContain("hasSession");
    expect(source).not.toContain("myRideRequests");
  });

  it("uses mutation responses locally for support, reports, and Admin collections", () => {
    expect(read("app/(shared)/support.tsx")).toContain("const created = await sendSupportMessage");
    expect(read("app/(shared)/report.tsx")).toContain("const created = await createReport");
    const admin = read("app/(admin)/dashboard.tsx");
    expect(admin).not.toContain(".then(load)");
    expect(admin).toContain("setSupport((current)");
    expect(admin).toContain("setReports((current)");
  });
});
