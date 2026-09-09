import fs from "fs";
import path from "path";

describe("admin control center recovery", () => {
  const root = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "components/admin/AdminControlCenter.tsx"), "utf8");
  const coordinator = fs.readFileSync(path.join(root, "hooks/useAdminReconciliation.ts"), "utf8");
  const route = fs.readFileSync(path.join(root, "app/(admin)/dashboard.tsx"), "utf8");

  it("uses the new operations control center route", () => {
    expect(route).toContain("AdminControlCenter");
    expect(source).toContain("Needs attention");
    expect(source).toContain("Platform controls");
  });

  it("keeps admin reconciliation guarantees centralized while the control center is open", () => {
    expect(source).toContain("useAdminReconciliation");
    expect(coordinator).toContain("useRealtime");
    expect(coordinator).toContain("useScreenReconciliation");
    expect(coordinator).toContain("ADMIN_CONNECTED_RECONCILIATION_MS = 15000");
    expect(coordinator).toContain("ADMIN_RECOVERY_RECONCILIATION_MS = 8000");
    expect(coordinator).toContain("setTimeout");
    expect(coordinator).not.toContain("setInterval");
    expect(coordinator).toContain("reconciliationRevision");
    expect(coordinator).toContain("ADMIN_EVENT_RESOURCES");
  });

  it("does not let one section request block another section from loading", () => {
    expect(source).toContain("Partial<Record<AdminSection, Promise<void>>>");
    expect(source).toContain("sectionInFlight.current[section]");
    expect(source).toContain("delete sectionInFlight.current[section]");
    expect(source).toContain("activeRef.current === section");
    expect(source).toContain("Promise.all([loadCore(), loadSection(section)])");
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
