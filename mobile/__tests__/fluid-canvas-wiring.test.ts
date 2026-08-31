import fs from "fs";
import path from "path";

describe("Alpha M fluid canvas surfaces", () => {
  const root = path.resolve(__dirname, "..");
  const home = fs.readFileSync(path.join(root, "app/(customer)/home.tsx"), "utf8");
  const driverHome = fs.readFileSync(path.join(root, "app/(driver)/home.tsx"), "utf8");
  const driverAccount = fs.readFileSync(path.join(root, "app/(driver)/account.tsx"), "utf8");
  const nav = fs.readFileSync(path.join(root, "components/layout/BottomNav.tsx"), "utf8");
  const locationPicker = fs.readFileSync(path.join(root, "app/(shared)/location-picker.tsx"), "utf8");

  it("keeps the customer home map-first and service-morph driven", () => {
    expect(home).toContain("HailingMapBackdrop");
    expect(home).toContain('const MODE_ORDER: CanvasMode[] = ["ride", "food", "courier"]');
    expect(home).toContain("PanResponder.create");
    expect(home).toContain('title: "Where to?"');
    expect(home).toContain('title: "Search cuisines"');
    expect(home).toContain('title: "Send a package"');
  });

  it("morphs service state with restrained motion and respects reduced motion", () => {
    expect(home).toContain("AccessibilityInfo.isReduceMotionEnabled");
    expect(home).toContain('AccessibilityInfo.addEventListener("reduceMotionChanged"');
    expect(home).toContain("Animated.parallel");
    expect(home).toContain("duration: 170");
    expect(home).toContain("duration: 260");
    expect(home).toContain("opacity: moodOpacity");
    expect(home).toContain("opacity: contentOpacity");
  });

  it("preserves safe-area top controls and the protected notification route", () => {
    expect(home).toContain("top: insets.top + 8");
    expect(home).toContain('router.push("/(shared)/notifications"');
    expect(home).toContain("BrandLogo");
  });

  it("opens the proven hailing destination picker as the immediate Where to action", () => {
    expect(home).toContain("/(shared)/location-picker?kind=dropoff&flow=hailing&focus=1");
    expect(locationPicker).toContain('focus?: string');
    expect(locationPicker).toContain('const shouldAutoFocus = params.focus === "1"');
    expect(locationPicker).toContain("autoFocus={shouldAutoFocus}");
    expect(locationPicker).toContain('if (hailingFlow && kind === "dropoff")');
    expect(locationPicker).toContain('router.replace("/(customer)/hail"');
  });

  it("lets the service state move the customer nav highlight without changing other screens", () => {
    expect(home).toContain('activeLabel={mode === "ride" ? "Home" : "Services"}');
    expect(home).toContain("bottomOffset={Math.max(insets.bottom, 10)}");
    expect(nav).toContain("activeLabel?: string");
    expect(nav).toContain("bottomOffset = 10");
    expect(nav).toContain("const routeActive = isItemActive(pathname, item)");
    expect(nav).toContain("if (!routeActive) router.replace(item.href as never)");
  });

  it("keeps Driver home a live mobility cockpit instead of a dashboard grid", () => {
    expect(driverHome).toContain("HailingMapBackdrop");
    expect(driverHome).toContain("const rideNowTitle = hailingOffer");
    expect(driverHome).toContain('router.push("/(driver)/hailing"');
    expect(driverHome).toContain('style={styles.intercityTitle}>Share a route</Text>');
    expect(driverHome).toContain('<BottomNav role="driver" bottomOffset={Math.max(insets.bottom, 10)} />');
    expect(driverHome).not.toContain("styles.metrics");
    expect(driverHome).not.toContain("Plan intercity rides. Manage passengers.");
  });

  it("keeps Driver account identity-first and relegates money to a utility", () => {
    expect(driverAccount).toContain("HailingMapBackdrop");
    expect(driverAccount).toContain("DRIVER PROFILE");
    expect(driverAccount).toContain("DRIVER TOOLS");
    expect(driverAccount).toContain("Wallet & settlement");
    expect(driverAccount).toContain("AccountDetailsSummary");
    expect(driverAccount).toContain("onRequestChange={requestAccountChange}");
    expect(driverAccount).toContain('<BottomNav role="driver" bottomOffset={Math.max(insets.bottom, 10)} />');
    expect(driverAccount).not.toContain("Earnings & payouts");
  });
});
