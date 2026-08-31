import fs from "fs";
import path from "path";

describe("admin control center recovery", () => {
  const root = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "components/admin/AdminControlCenter.tsx"), "utf8");
  const route = fs.readFileSync(path.join(root, "app/(admin)/dashboard.tsx"), "utf8");

  it("uses the new operations control center route", () => {
    expect(route).toContain("AdminControlCenter");
    expect(source).toContain("Needs attention");
    expect(source).toContain("Platform controls");
  });

  it("keeps admin data reconciled while the control center is open", () => {
    expect(source).toContain("useRealtime");
    expect(source).toContain("ADMIN_CONNECTED_RECONCILIATION_MS = 15000");
    expect(source).toContain("ADMIN_RECOVERY_RECONCILIATION_MS = 8000");
    expect(source).toContain("setTimeout");
    expect(source).not.toContain("setInterval");
    expect(source).toContain("reconciliationRevision");
  });

  it("guards verification metrics against stale backend status semantics", () => {
    expect(source).toContain('"approved", "verified", "active"');
    expect(source).toContain('"pending_uploads"');
    expect(source).toContain('pending_driver_verifications: pendingCount');
  });

  it("applies mutation responses locally instead of reloading entire sections", () => {
    expect(source).toContain("setSupport((current)");
    expect(source).toContain("setReports((current)");
    expect(source).toContain("setUsers((current)");
    expect(source).toContain("setRequests((current)");
    expect(source).toContain("setRides((current)");
  });
});
