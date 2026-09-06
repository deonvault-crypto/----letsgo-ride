/** @jest-environment node */
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(
  path.resolve(__dirname, "../../ops-web/public/support-conversations.js"),
  "utf8",
);

describe("Ops support realtime and staff reply controls", () => {
  it("keeps one authenticated support realtime listener active outside the open dialog", () => {
    expect(source).toContain("function ensureSupportRealtime()");
    expect(source).toContain("showAppWithSupportRealtime");
    expect(source).toContain("support_message.customer_replied");
    expect(source).toContain("New customer reply in Support.");
    expect(source).toContain("refreshSupportBadge");
    expect(source).toContain("refreshSupportQueue");
    expect(source).not.toContain("setInterval(");
  });

  it("offers edit and delete only through the authenticated support thread endpoints", () => {
    expect(source).toContain("data-support-edit-message");
    expect(source).toContain("data-support-delete-message");
    expect(source).toContain("method: 'PATCH'");
    expect(source).toContain("method: 'DELETE'");
    expect(source).toContain("canManageStaffMessage");
    expect(source).toContain("item.sender_type !== 'staff'");
  });
});

export {};
