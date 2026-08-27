import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("role account compliance wiring", () => {
  it.each([
    ["customer", "(shared)"],
    ["driver", "(driver)"],
    ["courier", "(courier)"],
    ["merchant", "(merchant)"],
  ])("mounts the canonical compliance controls for %s", (product, routeGroup) => {
    const source = readFileSync(join(__dirname, "..", "app", routeGroup, "account.tsx"), "utf8");
    expect(source).toContain(`AccountComplianceSections product="${product}"`);
  });
});
