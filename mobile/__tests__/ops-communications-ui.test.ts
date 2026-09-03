/** @jest-environment node */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");

describe("Ops communications forms", () => {
  let dom: any;
  let calls: Array<{ url: string; body: any }>;
  let campaign: any;
  const root = path.resolve(__dirname, "../../ops-web/public");
  const settle = () => new Promise(resolve => setTimeout(resolve, 30));
  async function setup(role = "admin") {
    calls = [];
    dom = new JSDOM(fs.readFileSync(path.join(root, "index.html"), "utf8"), { url: "http://audit.local", runScripts: "outside-only" });
    const w = dom.window;
    w.sessionStorage.setItem("lgr_ops_token", "audit-fixture");
    w.confirm = () => true;
    w.WebSocket = class { readyState = 1; close() {} send() {} };
    w.fetch = async (url: string, options: any = {}) => {
      const body = options.body ? JSON.parse(options.body) : null;
      calls.push({ url, body });
      let data: any = {};
      if (url.endsWith("/ops/me")) data = { id: "audit", name: "Audit operator", ops_role: role };
      else if (url.endsWith("/ops/communications") && options.method === "POST") {
        campaign = { ...body, id: "draft-1", revision: 1, status: "draft" }; data = campaign;
      } else if (url.endsWith("/ops/communications")) data = [];
      else if (url.endsWith("/preview")) data = { campaign, matching_accounts: 1, marketing_requires_consent: campaign.kind === "marketing" };
      else if (url.endsWith("/draft-1")) data = { campaign, metrics: { inbox_created: 0, push_accepted: 0, read: 0, push_unknown: 0, push_failed: 0 } };
      return { ok: true, json: async () => ({ success: true, data }) };
    };
    const context = dom.getInternalVMContext();
    vm.runInContext(fs.readFileSync(path.join(root, "app.js"), "utf8"), context);
    vm.runInContext(fs.readFileSync(path.join(root, "communications.js"), "utf8"), context);
    await settle();
    w.document.querySelector('[data-view="communications"]').click();
    await settle();
  }
  afterEach(() => dom?.window.close());

  it("saves a real draft, escapes content and shows an accurate preview before sending", async () => {
    await setup();
    const w = dom.window, d = w.document;
    d.querySelector("#newAnnouncement").click();
    const form = d.querySelector("#announcementForm");
    form.elements.title.value = '<img src=x onerror="alert(1)">';
    form.elements.body.value = "A service notice with a long address. ".repeat(20);
    form.elements.expires_at.value = "2026-09-04T12:00";
    form.dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
    await settle();
    expect(campaign.roles).toEqual(["passenger"]);
    expect(campaign.push).toBe(false);
    expect(d.querySelector("#announcementWorkspace img")).toBeNull();
    expect(d.querySelector("#announcementWorkspace").textContent).toContain("1 matching accounts");
    expect(d.querySelector("#publishAnnouncement")).not.toBeNull();
    expect(calls.filter(call => call.url.endsWith("/publish"))).toHaveLength(0);
  });

  it("keeps campaign creation and app release controls out of the CS role", async () => {
    await setup("cs");
    expect(dom.window.document.querySelector("#newAnnouncement")).toBeNull();
    expect(dom.window.document.querySelector("#appUpdatesNav").hidden).toBe(true);
    expect(calls.some(call => call.body)).toBe(false);
  });
});

export {};
