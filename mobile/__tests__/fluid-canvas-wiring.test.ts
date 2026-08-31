import fs from "fs";
import path from "path";

describe("Alpha M fluid canvas surfaces", () => {
  const root = path.resolve(__dirname, "..");
  const home = fs.readFileSync(path.join(root, "app/(customer)/home.tsx"), "utf8");
  const customerAccount = fs.readFileSync(path.join(root, "app/(shared)/account.tsx"), "utf8");
  const settings = fs.readFileSync(path.join(root, "app/(shared)/settings.tsx"), "utf8");
  const editProfile = fs.readFileSync(path.join(root, "app/(shared)/edit-profile.tsx"), "utf8");
  const driverIndex = fs.readFileSync(path.join(root, "app/(driver)/index.tsx"), "utf8");
  const driverLayout = fs.readFileSync(path.join(root, "app/(driver)/_layout.tsx"), "utf8");
  const driverHome = fs.readFileSync(path.join(root, "app/(driver)/home.tsx"), "utf8");
  const driverHailing = fs.readFileSync(path.join(root, "app/(driver)/hailing.tsx"), "utf8");
  const driverAccount = fs.readFileSync(path.join(root, "app/(driver)/account.tsx"), "utf8");
  const driverTrips = fs.readFileSync(path.join(root, "app/(driver)/trips.tsx"), "utf8");
  const driverPostTrip = fs.readFileSync(path.join(root, "app/(driver)/post-trip.tsx"), "utf8");
  const driverCalendar = fs.readFileSync(path.join(root, "app/(driver)/availability.tsx"), "utf8");
  const courierHome = fs.readFileSync(path.join(root, "app/(courier)/home.tsx"), "utf8");
  const mapBackdrop = fs.readFileSync(path.join(root, "components/hailing/HailingMapBackdrop.tsx"), "utf8");
  const nav = fs.readFileSync(path.join(root, "components/layout/BottomNav.tsx"), "utf8");
  const brandLogo = fs.readFileSync(path.join(root, "components/layout/BrandLogo.tsx"), "utf8");
  const screen = fs.readFileSync(path.join(root, "components/ui/Screen.tsx"), "utf8");
  const avatar = fs.readFileSync(path.join(root, "components/ui/Avatar.tsx"), "utf8");
  const accountSummary = fs.readFileSync(path.join(root, "components/account/AccountDetailsSummary.tsx"), "utf8");
  const compliance = fs.readFileSync(path.join(root, "components/account/AccountComplianceSections.tsx"), "utf8");
  const locationPicker = fs.readFileSync(path.join(root, "app/(shared)/location-picker.tsx"), "utf8");

  it("keeps the customer home map-first and service-morph driven", () => {
    expect(home).toContain("HailingMapBackdrop");
    expect(home).toContain('const MODE_ORDER: CanvasMode[] = ["ride", "food", "courier"]');
    expect(home).toContain("PanResponder.create");
    expect(home).toContain('title: "Where to?"');
    expect(home).toContain('title: "Search cuisines"');
    expect(home).toContain('title: "Send a package"');
  });

  it("keeps Ride home focused on Ride Now and leaves intercity to Services", () => {
    expect(home).toContain('{mode !== "ride" ? (');
    expect(home).toContain('router.push("/(shared)/services" as never)');
    expect(home).toContain('"Ride Now unavailable"');
    expect(home).toContain('"Open Services for other travel options"');
    expect(home).not.toContain('? "SCHEDULED RIDES"');
  });

  it("uses real device location instead of a decorative Harare pointer", () => {
    expect(home).toContain("showCurrentLocation");
    expect(home).toContain("promptForLocation");
    expect(home).toContain("showLocateControl");
    expect(home).not.toContain("styles.cityMarker");
    expect(home).not.toContain('<Text style={styles.cityName}>Harare</Text>');
    expect(mapBackdrop).toContain("getCurrentDeviceLocation");
    expect(mapBackdrop).toContain("watchForegroundLocation");
    expect(mapBackdrop).toContain("requestForegroundLocationPermission");
    expect(mapBackdrop).toContain("openLocationSettings");
    expect(mapBackdrop).toContain("const blankCanvas = focusCoordinates.length === 0");
    expect(mapBackdrop).toContain("<Circle");
    expect(mapBackdrop).toContain("styles.locationPuck");
    expect(mapBackdrop).toContain('accessibilityLabel="Locate me"');
    expect(mapBackdrop).toContain('name={locationState === "locating" ? "crosshairs" : "crosshairs-gps"}');
    expect(mapBackdrop).toContain("Improve location accuracy");
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

  it("keeps Account monochrome while preserving the LetsGoRide wordmark and destructive red", () => {
    expect(customerAccount).toContain('tone="neutral"');
    expect(customerAccount).toContain("accountType: { color: v2Theme.colors.ink");
    expect(customerAccount).toContain("quickIcon: { width: 36, height: 36, borderRadius: 13, backgroundColor: v2Theme.colors.surfaceMuted");
    expect(avatar).toContain('tone?: "brand" | "neutral"');
    expect(accountSummary).toContain("supportText: { color: v2Theme.colors.ink");
    expect(compliance).toContain('<ListTile tone="neutral" icon="lock-outline"');
    expect(compliance).toContain("danger");
    expect(screen).toContain('activeTone={routeName === "account" ? "neutral" : "brand"}');
    expect(nav).toContain('activeTone?: "brand" | "neutral"');
    expect(brandLogo).toContain('Lets<Text style={styles.green}>Go</Text>Ride');
    expect(brandLogo).toContain("color: colors.primaryGreen");
  });

  it("channels Account sections without repeating root content in nested pages", () => {
    expect(customerAccount).toContain("Quick access");
    expect(customerAccount).toContain('label="Inbox"');
    expect(customerAccount).toContain('label="Wallet"');
    expect(customerAccount).not.toContain('label="Help"');
    expect(customerAccount).not.toContain('label="Safety"');
    expect(customerAccount).toContain('subtitle="Notifications and device security"');

    expect(settings).toContain('<Screen title="Settings" showBack');
    expect(settings).toContain('showNotifications={false}');
    expect(settings).toContain('<Section title="Notifications"');
    expect(settings).toContain('<Section title="Security">');
    expect(settings).not.toContain("AccountComplianceSections");
    expect(settings).not.toContain('title="Account details"');
    expect(settings).not.toContain("Legal & support");
    expect(settings).not.toContain("Delete Account");
    expect(settings).not.toContain("Sign Out");
    expect(settings).not.toContain("navRole=");

    expect(editProfile).toContain('showNotifications={false}');
    expect(editProfile).toContain("fallbackRoute={accountFallback as never}");
    expect(editProfile).not.toContain("navRole=");
  });

  it("always resolves Driver group entry to Driver home", () => {
    expect(driverIndex).toContain('<Redirect href="/(driver)/home" />');
    expect(driverLayout).toContain('initialRouteName: "home"');
    expect(driverLayout).toContain('<Stack.Screen name="home"');
  });

  it("keeps Driver home a live mobility cockpit instead of a dashboard grid", () => {
    expect(driverHome).toContain("HailingMapBackdrop");
    expect(driverHome).toContain("const rideNowTitle = photoBlocksNewWork");
    expect(driverHome).toContain('router.push("/(driver)/hailing" as never)');
    expect(driverHome).toContain('style={styles.intercityTitle}>Share a route</Text>');
    expect(driverHome).toContain('<BottomNav role="driver" bottomOffset={Math.max(insets.bottom, 10)} />');
    expect(driverHome).not.toContain("styles.metrics");
    expect(driverHome).not.toContain("Plan intercity rides. Manage passengers.");
  });

  it("keeps Driver account simple, monochrome and identity-first", () => {
    expect(driverAccount).toContain('<Screen title="Driver account" navRole="driver" showNotifications>');
    expect(driverAccount).toContain("Profile & photo");
    expect(driverAccount).toContain('title="Earnings"');
    expect(driverAccount).toContain('title="Vehicle"');
    expect(driverAccount).toContain('title="Documents"');
    expect(driverAccount).toContain('title="Settings"');
    expect(driverAccount).toContain("AccountDetailsSummary");
    expect(driverAccount).toContain("onRequestChange={requestAccountChange}");
    expect(driverAccount).toContain("VerifiedBadge");
    expect(driverAccount).toContain("!verified ? (");
    expect(driverAccount).not.toContain("Driver verified");
    expect(driverAccount).not.toContain("shield-check");
    expect(driverAccount).not.toContain("HailingMapBackdrop");
    expect(driverAccount).not.toContain("DRIVER TOOLS");
    expect(driverAccount).not.toContain("Earnings & settlement");
    expect(driverAccount).not.toContain("Wallet & settlement");
    expect(driverAccount).not.toContain("v2Theme.colors.brand");
    expect(driverAccount).not.toContain("v2Theme.colors.brandStrong");
    expect(driverAccount).not.toContain("v2Theme.colors.brandSofter");
  });

  it("requires an Admin-approved profile photo before Driver and Courier start new work", () => {
    expect(driverHome).toContain("const photoApproved = user?.profile_photo_verified === true");
    expect(driverHome).toContain("const photoBlocksNewWork = !photoApproved");
    expect(driverHome).toContain("Profile photo approval required");
    expect(driverHailing).toContain("const photoApproved = user?.profile_photo_verified === true");
    expect(driverHailing).toContain("Admin-approved profile photo before going online for Ride Now");
    expect(driverHailing).not.toContain("const hasProfilePhoto = Boolean(user?.profile_photo_url?.trim())");
    expect(courierHome).toContain("const photoApproved = user?.profile_photo_verified === true");
    expect(courierHome).toContain("const photoRequired = Boolean(profile && approved && !photoApproved && !profile.online)");
    expect(courierHome).toContain("Add required Courier profile photo");
    expect(courierHome).toContain("Admin-approved Courier profile photo");
  });

  it("keeps Driver trips route-first instead of generic dashboard cards", () => {
    expect(driverTrips).toContain("YOUR ROAD");
    expect(driverTrips).toContain("Routes you’re driving.");
    expect(driverTrips).toContain("DriverRouteCard");
    expect(driverTrips).toContain("styles.routeRail");
    expect(driverTrips).not.toContain("RideCard");
  });

  it("keeps Post Trip as one continuous journey builder while preserving the proven fields", () => {
    expect(driverPostTrip).toContain("SHARE A ROUTE");
    expect(driverPostTrip).toContain("routePreview");
    expect(driverPostTrip).toContain("BuilderSection");
    expect(driverPostTrip).toContain('accessibilityLabel="Available seats"');
    expect(driverPostTrip).toContain('accessibilityLabel="Price USD per seat"');
    expect(driverPostTrip).toContain('accessibilityLabel="Vehicle"');
    expect(driverPostTrip).toContain('title="Publish trip"');
    expect(driverPostTrip).not.toContain("sectionCard");
  });

  it("keeps Driver Calendar as a driving timeline rather than a settings grid", () => {
    expect(driverCalendar).toContain("DRIVING CALENDAR");
    expect(driverCalendar).toContain("When can you drive?");
    expect(driverCalendar).toContain("Your driving timeline");
    expect(driverCalendar).toContain('accessibilityLabel="Add availability window"');
    expect(driverCalendar).toContain("styles.timelineRail");
    expect(driverCalendar).not.toContain("formCard");
  });
});
