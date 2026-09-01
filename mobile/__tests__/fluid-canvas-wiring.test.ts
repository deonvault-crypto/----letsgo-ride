import fs from "fs";
import path from "path";

const root = path.resolve(__dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

const customerHome = read("app/(customer)/home.tsx");
const customerRide = read("app/(customer)/ride.tsx");
const customerAccount = read("app/(customer)/account.tsx");
const sharedServices = read("app/(shared)/services.tsx");
const sharedSupport = read("app/(shared)/support.tsx");
const sharedSafety = read("app/(shared)/safety.tsx");
const sharedLegal = read("app/(shared)/legal.tsx");
const customerLayout = read("app/(customer)/_layout.tsx");
const bottomNav = read("components/navigation/BottomNav.tsx");
const appTopBar = read("components/ui/AppTopBar.tsx");
const driverLayout = read("app/(driver)/_layout.tsx");
const driverHome = read("app/(driver)/home.tsx");
const driverAccount = read("app/(driver)/account.tsx");
const driverTrips = read("app/(driver)/trips.tsx");
const driverPostTrip = read("app/(driver)/post-trip.tsx");
const driverCalendar = read("app/(driver)/availability.tsx");
const driverHailing = read("app/(driver)/hailing.tsx");
const courierHome = read("app/(courier)/home.tsx");


describe("Alpha M fluid canvas surfaces", () => {
  it("keeps the customer home map-first and service-morph driven", () => {
    expect(customerHome).toContain("CustomerHomeMap");
    expect(customerHome).toContain("ServiceMorphSurface");
    expect(customerHome).toContain("styles.mapStage");
    expect(customerHome).toContain("styles.mapFill");
    expect(customerHome).not.toContain("ServiceCard");
  });

  it("keeps Ride home focused on Ride Now and leaves intercity to Services", () => {
    expect(customerRide).toContain("Ride Now");
    expect(customerRide).toContain("flow=hailing");
    expect(customerRide).not.toContain("city-to-city");
    expect(sharedServices).toContain("Intercity");
  });

  it("uses real device location instead of a decorative Harare pointer", () => {
    expect(customerHome).toContain("Location.getCurrentPositionAsync");
    expect(customerHome).not.toContain("Harare");
  });

  it("morphs service state with restrained motion and respects reduced motion", () => {
    expect(customerHome).toContain("useReducedMotion");
    expect(customerHome).toContain("Animated.timing");
    expect(customerHome).toContain("duration: reduceMotion ? 0 : 180");
  });

  it("preserves safe-area top controls and the protected notification route", () => {
    expect(appTopBar).toContain("useSafeAreaInsets");
    expect(appTopBar).toContain("/(shared)/notifications");
    expect(appTopBar).toContain("showNotifications");
  });

  it("opens the proven hailing destination picker as the immediate Where to action", () => {
    expect(customerHome).toContain("flow=hailing");
    expect(customerHome).toContain("Where to?");
  });

  it("lets the service state move the customer nav highlight without changing other screens", () => {
    expect(customerLayout).toContain("useCustomerServiceMode");
    expect(bottomNav).toContain("activeOverride");
    expect(bottomNav).toContain("activeKey");
  });

  it("keeps Account monochrome while preserving the LetsGoRide wordmark and destructive red", () => {
    expect(customerAccount).toContain("letsgo-wordmark-dark.png");
    expect(customerAccount).toContain("v2Theme.colors.danger");
    expect(customerAccount).not.toContain("accountHero");
  });

  it("channels Account sections without repeating root content in nested pages", () => {
    expect(customerAccount).toContain("/(shared)/safety");
    expect(customerAccount).toContain("/(shared)/support");
    expect(customerAccount).toContain("/(shared)/legal");
    expect(sharedSafety).not.toContain("Support center");
    expect(sharedSupport).not.toContain("Privacy policy");
    expect(sharedLegal).not.toContain("Delete account");
  });

  it("always resolves Driver group entry to Driver home", () => {
    expect(driverLayout).toContain("redirectTo: \"/(driver)/home\"");
    expect(driverLayout).not.toContain("redirectTo: \"/(driver)/hailing\"");
  });

  it("keeps Driver home a live mobility cockpit instead of a dashboard grid", () => {
    expect(driverHome).toContain("DriverMobilityMap");
    expect(driverHome).toContain("DriverWorkspaceProvider");
    expect(driverHome).toContain("DriverHomeStatus");
    expect(driverHome).not.toContain("MetricCard");
  });

  it("keeps Driver account simple, monochrome and identity-first", () => {
    expect(driverAccount).toContain("letsgo-wordmark-dark.png");
    expect(driverAccount).toContain("Profile photo");
    expect(driverAccount).not.toContain("accountHero");
  });

  it("requires an Admin-approved profile photo before Driver and Courier start new work", () => {
    expect(driverHome).toContain('"Add your profile photo"');
    expect(driverHome).toContain('step: "STEP 1 OF 3"');
    expect(driverHailing).toContain("const photoApproved = user?.profile_photo_verified === true");
    expect(driverHailing).toContain("Admin-approved profile photo before going online for Ride Now");
    expect(driverHailing).not.toContain("const hasProfilePhoto = Boolean(user?.profile_photo_url?.trim())");
    expect(courierHome).toContain("const photoApproved = user?.profile_photo_verified === true");
    expect(courierHome).toContain("const photoRequired = Boolean(profile && approved && !photoApproved && !profile.online)");
    expect(courierHome).toContain("Add required Courier profile photo");
    expect(courierHome).toContain("Admin-approved Courier profile photo");
  });

  it("keeps Driver trips route-first instead of generic dashboard cards", () => {
    expect(driverTrips).toContain("INTERCITY");
    expect(driverTrips).toContain("Your intercity routes.");
    expect(driverTrips).toContain("DriverRouteCard");
    expect(driverTrips).toContain("styles.routeRail");
    expect(driverTrips).not.toContain("RideCard");
  });

  it("keeps Post Trip as one continuous journey builder while preserving the proven fields", () => {
    expect(driverPostTrip).toContain("INTERCITY RIDE");
    expect(driverPostTrip).toContain("routePreview");
    expect(driverPostTrip).toContain("BuilderSection");
    expect(driverPostTrip).toContain('accessibilityLabel="Available seats"');
    expect(driverPostTrip).toContain('accessibilityLabel="Price USD per seat"');
    expect(driverPostTrip).toContain('accessibilityLabel="Vehicle"');
    expect(driverPostTrip).toContain('title="Publish trip"');
    expect(driverPostTrip).not.toContain("sectionCard");
  });

  it("keeps Driver Calendar as a driving timeline rather than a settings grid", () => {
    expect(driverCalendar).toContain("INTERCITY CALENDAR");
    expect(driverCalendar).toContain("When can you drive?");
    expect(driverCalendar).toContain("Your driving timeline");
    expect(driverCalendar).toContain('accessibilityLabel="Add availability window"');
    expect(driverCalendar).toContain("styles.timelineRail");
    expect(driverCalendar).not.toContain("formCard");
  });
});
