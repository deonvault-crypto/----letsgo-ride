/** @jest-environment node */
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(
  path.resolve(__dirname, "../../ops-web/public/ops-live-reconcile.js"),
  "utf8",
);
const index = fs.readFileSync(
  path.resolve(__dirname, "../../ops-web/public/index.html"),
  "utf8",
);

describe("Ops global realtime reconciliation", () => {
  it("keeps an authenticated session-wide realtime connection with reconnect and fallback reconciliation", () => {
    expect(source).toContain("function ensureOpsRealtime()");
    expect(source).toContain("new WebSocket(REALTIME_URL");
    expect(source).toContain("letsgoride.auth.${token}");
    expect(source).toContain("function handleRealtimeMessage");
    expect(source).toContain("function scheduleReconcile");
    expect(source).toContain("const RECONCILE_MS = 10000");
    expect(source).not.toContain("setInterval(");
  });

  it("refreshes operational views and badges without interrupting active staff work", () => {
    expect(source).toContain("refreshNavigationBadges");
    expect(source).toContain("refreshCurrentView");
    expect(source).toContain("shouldDeferViewRefresh");
    expect(source).toContain("dialog[open]");
    expect(source).toContain("hasChangedControl");
    expect(source).toContain("SELF_MANAGED_VIEWS");
    expect(source).toContain("support_message");
  });

  it("is loaded by the production Ops shell", () => {
    expect(index).toContain('/ops-live-reconcile.js?v=1');
  });
});

export {};
