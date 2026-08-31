from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text()


def write(path: str, text: str) -> None:
    Path(path).write_text(text)


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    if old not in text:
        if new in text:
            return
        raise SystemExit(f"Patch marker not found in {path}: {old[:140]!r}")
    write(path, text.replace(old, new, 1))


# #5 — Customer Ride is Ride Now only. Remove the remaining intercity doorway.
replace_once(
    "mobile/app/(shared)/services.tsx",
    '<ServiceStoryCard title="Ride" subtitle="Search local journeys and planned city-to-city trips" eyebrow="GO SOMEWHERE" icon="car-outline" image={require("../../assets/images/ride-harare-owned-v2.jpg")} onPress={() => router.push("/(customer)/search" as never)} />',
    '<ServiceStoryCard title="Ride" subtitle="Request a nearby ride with live driver matching" eyebrow="RIDE NOW" icon="car-outline" image={require("../../assets/images/ride-harare-owned-v2.jpg")} onPress={() => router.push("/(shared)/location-picker?kind=dropoff&flow=hailing&focus=1" as never)} />',
)
replace_once(
    "mobile/app/(shared)/services.tsx",
    'eyebrow: { color: v2Theme.colors.brandStrong, fontSize: 11, fontWeight: "900", letterSpacing: 1.25 },',
    'eyebrow: { color: v2Theme.colors.inkTertiary, fontSize: 11, fontWeight: "900", letterSpacing: 1.25 },',
)


# #10 — Driver verification is selfie + identity + licence. Keep legacy vehicle
# document upload parsing backward-compatible for existing Build 38 clients only.
verification_path = "backend/app/services/verification_service.py"
text = read(verification_path)
old_required = '''REQUIRED_DOCUMENTS = [
    "selfie",
    "identity_document",
    "driver_license",
    "vehicle_registration_or_logbook",
    "vehicle_photo_optional",
]
'''
new_required = '''REQUIRED_DOCUMENTS = [
    "selfie",
    "identity_document",
    "driver_license",
]
LEGACY_OPTIONAL_DOCUMENT_TYPES = {
    "vehicle_registration_or_logbook",
    "vehicle_photo_optional",
}
SUPPORTED_DOCUMENT_TYPES = set(REQUIRED_DOCUMENTS) | LEGACY_OPTIONAL_DOCUMENT_TYPES
'''
if old_required not in text:
    raise SystemExit("verification required-document block not found")
text = text.replace(old_required, new_required, 1)
text = text.replace(
    'REQUIRED_DOCUMENT_TYPES = set(REQUIRED_DOCUMENTS) - {"vehicle_photo_optional"}',
    'REQUIRED_DOCUMENT_TYPES = set(REQUIRED_DOCUMENTS)',
    1,
)
text = text.replace(
    'return normalized if normalized in REQUIRED_DOCUMENTS else None',
    'return normalized if normalized in SUPPORTED_DOCUMENT_TYPES else None',
    1,
)
if "SUPPORTED_DOCUMENT_TYPES" not in text or 'REQUIRED_DOCUMENT_TYPES = set(REQUIRED_DOCUMENTS)' not in text:
    raise SystemExit("verification compatibility patch incomplete")
write(verification_path, text)

mobile_verification_path = "mobile/app/(shared)/verification.tsx"
text = read(mobile_verification_path)
old_manual = '''const manualDocumentTypes: VerificationDocumentType[] = [
  "selfie",
  "identity_document",
  "driver_license",
  "vehicle_registration_or_logbook",
  "vehicle_photo_optional",
];'''
new_manual = '''const manualDocumentTypes: VerificationDocumentType[] = [
  "selfie",
  "identity_document",
  "driver_license",
];'''
if old_manual not in text:
    raise SystemExit("mobile verification document list not found")
text = text.replace(old_manual, new_manual, 1)
for line in (
    '  vehicle_registration_or_logbook: "Registration or logbook",\n',
    '  vehicle_photo_optional: "Vehicle photo",\n',
    '  vehicle_registration_or_logbook: "Capture the vehicle registration or logbook details.",\n',
    '  vehicle_photo_optional: "Take a clear exterior photo of the vehicle passengers will see.",\n',
    '  vehicle_registration_or_logbook: "Scan registration/logbook",\n',
    '  vehicle_photo_optional: "Take vehicle photo",\n',
):
    text = text.replace(line, "")
text = text.replace(
    'const requiredCaptureDocuments = requiredDocuments.filter((item) => item !== "vehicle_photo_optional");',
    'const requiredCaptureDocuments = requiredDocuments;',
    1,
)
text = text.replace(
    "Complete a camera-based identity check before posting public rides.",
    "Complete a camera-based identity and licence check before driving with Ride Now.",
    1,
)
text = text.replace(
    "LetsGoRide uses live capture for your selfie, identity document, driver licence, and vehicle record. If automated checks need help, the same captured documents move to manual review.",
    "LetsGoRide uses live capture for your selfie, identity document and driver licence. If automated checks need help, the same captured documents move to manual review.",
    1,
)
text = text.replace(
    "Use the camera for each check. Make sure names, faces, licence numbers, and vehicle details are sharp and readable.",
    "Use the camera for each check. Make sure names, faces and licence numbers are sharp and readable.",
    1,
)
text = text.replace(
    '''I consent to LetsGoRide reviewing my identity and vehicle
                documents for driver verification, safety, and fraud
                prevention.''',
    '''I consent to LetsGoRide reviewing my identity documents and driver licence
                for driver verification, safety, and fraud prevention.''',
    1,
)
if "vehicle_registration_or_logbook" in text or "vehicle record" in text:
    raise SystemExit("vehicle registration still exposed in mobile verification")
write(mobile_verification_path, text)


# #11 — all three launch classes share one enabled source of truth.
city_path = "backend/app/services/hailing_city_service.py"
text = read(city_path)
text = text.replace(
    "PRICING_VERSION = 2\nSTAGING_EXTERNAL_TEST_CITY_ID",
    'PRICING_VERSION = 3\nLAUNCH_RIDE_CLASSES = ("ECONOMY", "COMFORT", "XL")\nSTAGING_EXTERNAL_TEST_CITY_ID',
    1,
)
start = text.index("DEFAULT_CITY_PRICING = {")
end = text.index("\n}\n\nDEFAULT_DISPATCH_SETTINGS", start) + 2
default_block = text[start:end].replace('"enabled": False', '"enabled": True')
text = text[:start] + default_block + text[end:]
old_enabled = '''def enabled_ride_classes(city: Dict[str, Any]) -> List[str]:
    pricing = city.get("pricing") or {}
    return [
        ride_class
        for ride_class in ("ECONOMY", "COMFORT", "XL")
        if bool((pricing.get(ride_class) or {}).get("enabled"))
    ]
'''
new_enabled = '''def enabled_ride_classes(city: Dict[str, Any]) -> List[str]:
    _ = city
    return list(LAUNCH_RIDE_CLASSES)
'''
if old_enabled not in text:
    raise SystemExit("enabled ride classes block not found")
text = text.replace(old_enabled, new_enabled, 1)
old_migration = '''        if all(current.get(field) == value for field, value in legacy.items()):
            migrated[ride_class] = dict(DEFAULT_CITY_PRICING[ride_class])
            changed = True
    return migrated if changed else None
'''
new_migration = '''        if all(current.get(field) == value for field, value in legacy.items()):
            migrated[ride_class] = dict(DEFAULT_CITY_PRICING[ride_class])
            changed = True
            continue
        sanitized = dict(current)
        if sanitized.get("enabled") is not True:
            sanitized["enabled"] = True
            migrated[ride_class] = sanitized
            changed = True
    return migrated if changed else None
'''
if old_migration not in text:
    raise SystemExit("city pricing migration block not found")
text = text.replace(old_migration, new_migration, 1)
old_update = '''        if key in data:
            value = data.pop(key)
            pricing[field] = bool(value) if field == "enabled" else float(value)
    return pricing
'''
new_update = '''        if key in data:
            value = data.pop(key)
            if field != "enabled":
                pricing[field] = float(value)
    pricing["enabled"] = True
    return pricing
'''
if old_update not in text:
    raise SystemExit("city pricing update block not found")
text = text.replace(old_update, new_update, 1)
write(city_path, text)


# #12 — replace the static searching icon with subtle, neutral radar motion.
search_path = "mobile/app/(customer)/hail/searching.tsx"
text = read(search_path)
text = text.replace(
    'import { useEffect, useMemo, useState } from "react";',
    'import { useEffect, useMemo, useRef, useState } from "react";',
    1,
)
text = text.replace(
    'import { Pressable, StatusBar, StyleSheet, Text, View } from "react-native";',
    'import { AccessibilityInfo, Animated, Easing, Pressable, StatusBar, StyleSheet, Text, View } from "react-native";',
    1,
)
radar_component = r'''
function DriverSearchRadar({ active }: { active: boolean }) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const pulseOne = useRef(new Animated.Value(0)).current;
  const pulseTwo = useRef(new Animated.Value(0)).current;
  const pulseThree = useRef(new Animated.Value(0)).current;
  const carLift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => { if (mounted) setReduceMotion(enabled); })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    pulseOne.stopAnimation();
    pulseTwo.stopAnimation();
    pulseThree.stopAnimation();
    carLift.stopAnimation();
    if (!active || reduceMotion) {
      pulseOne.setValue(0.34);
      pulseTwo.setValue(0.20);
      pulseThree.setValue(0.08);
      carLift.setValue(0);
      return undefined;
    }

    const pulse = (value: Animated.Value, delay: number) => Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(value, { toValue: 1, duration: 1450, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(value, { toValue: 0, duration: 1, useNativeDriver: true }),
        Animated.delay(Math.max(0, 900 - delay)),
      ]),
    );
    const lift = Animated.loop(Animated.sequence([
      Animated.timing(carLift, { toValue: -2, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(carLift, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    const animations = [pulse(pulseOne, 0), pulse(pulseTwo, 320), pulse(pulseThree, 640), lift];
    animations.forEach((animation) => animation.start());
    return () => animations.forEach((animation) => animation.stop());
  }, [active, carLift, pulseOne, pulseThree, pulseTwo, reduceMotion]);

  const ringStyle = (value: Animated.Value, baseScale: number) => ({
    opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.32, 0] }),
    transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [baseScale, baseScale + 0.58] }) }],
  });

  return (
    <View accessibilityLabel="Searching nearby for an approved driver" style={styles.radar}>
      <Animated.View pointerEvents="none" style={[styles.radarRing, ringStyle(pulseThree, 0.72)]} />
      <Animated.View pointerEvents="none" style={[styles.radarRing, ringStyle(pulseTwo, 0.58)]} />
      <Animated.View pointerEvents="none" style={[styles.radarRing, ringStyle(pulseOne, 0.44)]} />
      <Animated.View style={[styles.radarCar, { transform: [{ translateY: carLift }] }]}>
        <MaterialCommunityIcons name="car" size={25} color="#FFFFFF" />
      </Animated.View>
    </View>
  );
}

'''
export_marker = "export default function HailingSearchingScreen() {"
if export_marker not in text:
    raise SystemExit("search screen export marker not found")
text = text.replace(export_marker, radar_component + export_marker, 1)
status_block = '''        <View style={styles.statusRow}>
          <View style={[styles.statusIcon, noDriver && styles.statusIconWarning]}>
'''
if status_block not in text:
    raise SystemExit("search status block not found")
text = text.replace(
    status_block,
    '''        {!noDriver ? <DriverSearchRadar active={!loading && trip?.status === "SEARCHING"} /> : null}
        <View style={styles.statusRow}>
          <View style={[styles.statusIcon, noDriver && styles.statusIconWarning]}>
''',
    1,
)
text = text.replace('<BottomNav role="customer" />', '<BottomNav role="customer" activeTone="neutral" />', 1)
text = text.replace('backgroundColor: v2Theme.colors.brand,', 'backgroundColor: RIDE_BLACK,', 1)
style_marker = '  statusRow: { flexDirection: "row", alignItems: "center", gap: 11 },\n'
radar_styles = '''  radar: { height: 104, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  radarRing: { position: "absolute", width: 94, height: 94, borderRadius: 47, borderWidth: 1, borderColor: "rgba(17,17,17,0.46)" },
  radarCar: { width: 48, height: 48, borderRadius: 24, backgroundColor: RIDE_BLACK, alignItems: "center", justifyContent: "center", shadowColor: "#000000", shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 6 },
'''
if style_marker not in text:
    raise SystemExit("search style marker not found")
text = text.replace(style_marker, radar_styles + style_marker, 1)
if "DriverSearchRadar" not in text or "AccessibilityInfo" not in text:
    raise SystemExit("driver-search animation patch incomplete")
write(search_path, text)


# #13 — Zimbabwe-first search: nationwide curated fallback, country hint, and
# coordinate guard so ambiguous international matches cannot leak into Ride Now.
routing_path = "backend/app/services/routing_service.py"
text = read(routing_path)
discovery_start = text.index("_ZIMBABWE_DISCOVERY = [")
discovery_end = text.index("\n]\n\n\nclass RoutingError", discovery_start) + 2
discovery = '''_ZIMBABWE_DISCOVERY = [
    ("Harare", "Harare, Zimbabwe", -17.824858, 31.053028),
    ("Bulawayo", "Bulawayo, Zimbabwe", -20.149812, 28.585388),
    ("Chitungwiza", "Chitungwiza, Zimbabwe", -18.0127, 31.0756),
    ("Mutare", "Mutare, Zimbabwe", -18.9707, 32.6709),
    ("Gweru", "Gweru, Zimbabwe", -19.4513, 29.8152),
    ("Kwekwe", "Kwekwe, Zimbabwe", -18.9281, 29.8149),
    ("Kadoma", "Kadoma, Zimbabwe", -18.3333, 29.9167),
    ("Masvingo", "Masvingo, Zimbabwe", -20.0744, 30.8328),
    ("Chinhoyi", "Chinhoyi, Zimbabwe", -17.3667, 30.2000),
    ("Marondera", "Marondera, Zimbabwe", -18.1853, 31.5519),
    ("Victoria Falls", "Victoria Falls, Zimbabwe", -17.9243, 25.8560),
    ("Hwange", "Hwange, Zimbabwe", -18.3645, 26.4988),
    ("Kariba", "Kariba, Zimbabwe", -16.5167, 28.8000),
    ("Bindura", "Bindura, Zimbabwe", -17.3019, 31.3306),
    ("Beitbridge", "Beitbridge, Zimbabwe", -22.2167, 30.0000),
    ("Zvishavane", "Zvishavane, Zimbabwe", -20.3267, 30.0665),
    ("Redcliff", "Redcliff, Zimbabwe", -19.0333, 29.7833),
    ("Rusape", "Rusape, Zimbabwe", -18.5278, 32.1284),
    ("Chegutu", "Chegutu, Zimbabwe", -18.1302, 30.1407),
    ("Norton", "Norton, Zimbabwe", -17.8833, 30.7000),
    ("Gwanda", "Gwanda, Zimbabwe", -20.9333, 29.0000),
    ("Plumtree", "Plumtree, Zimbabwe", -20.4833, 27.8167),
    ("Shurugwi", "Shurugwi, Zimbabwe", -19.6702, 30.0059),
    ("Chipinge", "Chipinge, Zimbabwe", -20.1883, 32.6236),
    ("Chiredzi", "Chiredzi, Zimbabwe", -21.0500, 31.6667),
    ("Karoi", "Karoi, Zimbabwe", -16.8167, 29.6833),
    ("Gokwe", "Gokwe, Zimbabwe", -18.2167, 28.9333),
    ("Lupane", "Lupane, Zimbabwe", -18.9315, 27.8069),
    ("Triangle", "Triangle, Zimbabwe", -21.0333, 31.4500),
    ("Mvurwi", "Mvurwi, Zimbabwe", -17.0333, 30.8500),
    ("Joina City", "Joina City, Jason Moyo Avenue, Harare, Zimbabwe", -17.8313, 31.0477),
    ("Sam Levy’s Village", "Sam Levy’s Village, Borrowdale, Harare, Zimbabwe", -17.7622, 31.0902),
    ("Robert Gabriel Mugabe International Airport", "Harare Airport, Zimbabwe", -17.9318, 31.0928),
    ("Joshua Mqabuko Nkomo International Airport", "Bulawayo Airport, Zimbabwe", -20.0174, 28.6179),
]'''
text = text[:discovery_start] + discovery + text[discovery_end:]
helper_index = text.index("def _curated_suggestions")
helpers = '''def _zimbabwe_geocode_query(address: str, region_code: str) -> str:
    clean = " ".join(address.strip().split())
    if region_code.strip().upper() == "ZW" and "zimbabwe" not in clean.lower():
        return f"{clean}, Zimbabwe"
    return clean


def _coordinate_in_region(latitude: float, longitude: float, region_code: str) -> bool:
    if region_code.strip().upper() != "ZW":
        return True
    return -23.2 <= latitude <= -15.3 and 25.0 <= longitude <= 33.3


'''
text = text[:helper_index] + helpers + text[helper_index:]
text = text.replace(
    '    url = GOOGLE_GEOCODE_URL.format(address=quote(clean_address, safe=""))',
    '    provider_address = _zimbabwe_geocode_query(clean_address, region_code)\n    url = GOOGLE_GEOCODE_URL.format(address=quote(provider_address, safe=""))',
    1,
)
geocode_guard = '''    if not isinstance(latitude, (int, float)) or not isinstance(longitude, (int, float)):
        raise RoutingNoResultError("The routing provider did not return coordinates for that address.")

    return {
'''
geocode_guard_new = '''    if not isinstance(latitude, (int, float)) or not isinstance(longitude, (int, float)):
        raise RoutingNoResultError("The routing provider did not return coordinates for that address.")
    if not _coordinate_in_region(float(latitude), float(longitude), region_code):
        raise RoutingNoResultError("No Zimbabwe location was found for that address.")

    return {
'''
if geocode_guard not in text:
    raise SystemExit("geocode coordinate guard marker not found")
text = text.replace(geocode_guard, geocode_guard_new, 1)
places_body = '''    body = {
        "input": clean_query,
        "regionCode": region_code,
        "includedRegionCodes": [region_code.lower()],
    }
'''
places_body_new = '''    body = {
        "input": clean_query,
        "regionCode": region_code,
        "includedRegionCodes": [region_code.lower()],
        "languageCode": "en",
    }
'''
if places_body not in text:
    raise SystemExit("places autocomplete body marker not found")
text = text.replace(places_body, places_body_new, 1)
text = text.replace(
    'async def resolve_place(place_id: str) -> Dict[str, Any]:\n    api_key, _, timeout = _google_config()',
    'async def resolve_place(place_id: str) -> Dict[str, Any]:\n    api_key, region_code, timeout = _google_config()',
    1,
)
resolve_guard = '''    if not isinstance(latitude, (int, float)) or not isinstance(longitude, (int, float)):
        raise RoutingNoResultError("That place does not have usable map coordinates.")
    display_name = payload.get("displayName") or {}
'''
resolve_guard_new = '''    if not isinstance(latitude, (int, float)) or not isinstance(longitude, (int, float)):
        raise RoutingNoResultError("That place does not have usable map coordinates.")
    if not _coordinate_in_region(float(latitude), float(longitude), region_code):
        raise RoutingNoResultError("That place is outside Zimbabwe.")
    display_name = payload.get("displayName") or {}
'''
if resolve_guard not in text:
    raise SystemExit("place details coordinate guard marker not found")
text = text.replace(resolve_guard, resolve_guard_new, 1)
write(routing_path, text)


# #3 — Admin profile-photo queue: bounded/indexed backend and actual Control Center UI.
photo_router_path = "backend/app/routers/admin_profile_photos.py"
text = read(photo_router_path)
old_query = '''    rows = await database.find_many("users", {"role": {"$in": sorted(WORKER_ROLES)}})
    items = []
'''
new_query = '''    candidate_filter = {
        "role": {"$in": sorted(WORKER_ROLES)},
        "$or": [
            {"profile_photo_pending_url": {"$exists": True, "$ne": None}},
            {
                "profile_photo_url": {"$exists": True, "$ne": None},
                "profile_photo_verified": {"$ne": True},
            },
        ],
    }
    rows = await database.find_many(
        "users",
        candidate_filter,
        sort=[("profile_photo_submitted_at", -1), ("updated_at", -1)],
        limit=min(200, max(limit * 3, 80)),
    )
    items = []
'''
if old_query not in text:
    raise SystemExit("profile photo unbounded query marker not found")
text = text.replace(old_query, new_query, 1)
write(photo_router_path, text)

database_path = "backend/app/database.py"
text = read(database_path)
index_marker = '''        await self.db["drivers"].create_index(
            [("verification_status", 1), ("updated_at", -1)],
            name="admin_driver_verification_queue",
        )
'''
index_add = index_marker + '''        await self.db["users"].create_index(
            [("role", 1), ("profile_photo_review_status", 1), ("profile_photo_submitted_at", -1)],
            name="admin_worker_profile_photo_review",
        )
'''
if index_marker not in text:
    raise SystemExit("database admin index marker not found")
text = text.replace(index_marker, index_add, 1)
write(database_path, text)

admin_service_path = "mobile/services/adminService.ts"
text = read(admin_service_path)
type_marker = '''export type AdminListResponse<T> = {
  count: number;
  items: T[];
};
'''
type_add = type_marker + '''
export type AdminProfilePhotoReviewItem = {
  user_id: string;
  name?: string;
  email?: string;
  role: "driver" | "courier";
  city?: string;
  candidate_url: string;
  current_approved_url?: string | null;
  profile_photo_verified: boolean;
  review_status: "pending" | "approved" | "rejected";
  rejection_reason?: string | null;
  submitted_at?: string | null;
  is_replacement: boolean;
};
'''
if type_marker not in text:
    raise SystemExit("admin service list type marker not found")
text = text.replace(type_marker, type_add, 1)
function_marker = "export async function listAdminVerifications(status?: VerificationStatus, search?: string) {"
functions = '''export async function listAdminProfilePhotos(status: "pending" | "approved" | "rejected" = "pending") {
  return requestData<AdminListResponse<AdminProfilePhotoReviewItem>>({
    method: "GET",
    url: "/admin/profile-photos",
    params: { status },
  });
}

export async function updateAdminProfilePhotoStatus(userId: string, status: "approved" | "rejected", reason?: string) {
  return requestData<{
    user_id: string;
    role: "driver" | "courier";
    profile_photo_url?: string | null;
    profile_photo_verified: boolean;
    review_status: "approved" | "rejected";
    rejection_reason?: string | null;
  }>({
    method: "PATCH",
    url: `/admin/profile-photos/${userId}`,
    data: { status, reason },
  });
}

'''
if function_marker not in text:
    raise SystemExit("admin verification function marker not found")
text = text.replace(function_marker, functions + function_marker, 1)
write(admin_service_path, text)

control_path = "mobile/components/admin/AdminControlCenter.tsx"
text = read(control_path)
text = text.replace(
    'import { Alert, Modal, Pressable, StyleSheet, Text, View } from "react-native";',
    'import { Alert, Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";',
    1,
)
text = text.replace(
    '  AdminSupportMessage,\n  AdminUser,',
    '  AdminSupportMessage,\n  AdminProfilePhotoReviewItem,\n  AdminUser,',
    1,
)
text = text.replace(
    '  listAdminAuditLogs,\n  listAdminReports,',
    '  listAdminAuditLogs,\n  listAdminProfilePhotos,\n  listAdminReports,',
    1,
)
text = text.replace(
    '  updateAdminReportStatus,\n  updateAdminRequestStatus,',
    '  updateAdminProfilePhotoStatus,\n  updateAdminReportStatus,\n  updateAdminRequestStatus,',
    1,
)
text = text.replace(
    '  "notification",\n]);',
    '  "notification",\n  "profile_photo",\n]);',
    1,
)
text = text.replace(
    'type AdminSection = "overview" | "verifications" | "support" | "safety" | "bookings" | "users" | "rides" | "audit";',
    'type AdminSection = "overview" | "profile_photos" | "verifications" | "support" | "safety" | "bookings" | "users" | "rides" | "audit";',
    1,
)
text = text.replace(
    '  const [verifications, setVerifications] = useState<AdminVerificationListItem[]>([]);',
    '  const [verifications, setVerifications] = useState<AdminVerificationListItem[]>([]);\n  const [profilePhotos, setProfilePhotos] = useState<AdminProfilePhotoReviewItem[]>([]);',
    1,
)
text = text.replace(
    'request = Promise.all([getAdminOverview(), listAdminVerifications()])\n      .then(([overviewData, verificationData]) => {',
    'request = Promise.all([getAdminOverview(), listAdminVerifications(), listAdminProfilePhotos("pending")])\n      .then(([overviewData, verificationData, profilePhotoData]) => {',
    1,
)
text = text.replace(
    '        setVerifications(verificationData.items);',
    '        setVerifications(verificationData.items);\n        setProfilePhotos(profilePhotoData.items);',
    1,
)
text = text.replace(
    'if (section === "overview" || section === "verifications") return Promise.resolve();',
    'if (section === "overview" || section === "profile_photos" || section === "verifications") return Promise.resolve();',
    1,
)
searched_marker = '''  const searchedVerifications = useMemo(
    () => filterSearch(verifications, search, ["name", "email", "phone", "city", "verification_status"]),
    [search, verifications],
  );
'''
if searched_marker not in text:
    raise SystemExit("admin searched verification marker not found")
text = text.replace(
    searched_marker,
    searched_marker + '''  const searchedProfilePhotos = useMemo(
    () => filterSearch(profilePhotos, search, ["name", "email", "role", "city", "review_status"]),
    [profilePhotos, search],
  );
''',
    1,
)
text = text.replace(
    '          pendingVerifications={pendingVerifications.length}\n          onOpen={switchSection}',
    '          pendingVerifications={pendingVerifications.length}\n          pendingProfilePhotos={profilePhotos.length}\n          onOpen={switchSection}',
    1,
)
verification_render = '''          {active === "verifications" ? (
            <VerificationList items={searchedVerifications} onReview={(driverId) => router.push(`/(admin)/verification/${driverId}` as never)} />
          ) : null}
'''
if verification_render not in text:
    raise SystemExit("admin verification render marker not found")
photo_render = '''          {active === "profile_photos" ? (
            <ProfilePhotoList
              items={searchedProfilePhotos}
              onApprove={async (item) => {
                await updateAdminProfilePhotoStatus(item.user_id, "approved");
                setProfilePhotos((current) => current.filter((candidate) => candidate.user_id !== item.user_id));
              }}
              onReject={(item) => setReasonAction({
                title: "Reject profile photo",
                message: `Ask ${item.name || "this worker"} to upload another clear profile photo?`,
                reasonLabel: "Reason for rejection",
                confirmLabel: "Reject photo",
                onConfirm: async (actionReason) => {
                  await updateAdminProfilePhotoStatus(item.user_id, "rejected", actionReason);
                  setProfilePhotos((current) => current.filter((candidate) => candidate.user_id !== item.user_id));
                },
              })}
            />
          ) : null}

'''
text = text.replace(verification_render, photo_render + verification_render, 1)
text = text.replace(
    '  pendingVerifications,\n  onOpen,',
    '  pendingVerifications,\n  pendingProfilePhotos,\n  onOpen,',
    1,
)
text = text.replace(
    '  pendingVerifications: number;\n  onOpen: (section: AdminSection) => void;',
    '  pendingVerifications: number;\n  pendingProfilePhotos: number;\n  onOpen: (section: AdminSection) => void;',
    1,
)
text = text.replace(
    '<Metric value={pendingVerifications} label="Pending checks" urgent={pendingVerifications > 0} />',
    '<Metric value={pendingVerifications + pendingProfilePhotos} label="Pending checks" urgent={pendingVerifications + pendingProfilePhotos > 0} />',
    1,
)
text = text.replace(
    '<AttentionRow icon="shield-account-outline" title="Driver verification" subtitle="Review identity and vehicle documents" count={pendingVerifications} onPress={() => onOpen("verifications")} />',
    '<AttentionRow icon="account-box-outline" title="Profile photos" subtitle="Approve Driver and Courier profile photos" count={pendingProfilePhotos} onPress={() => onOpen("profile_photos")} />\n        <AttentionRow icon="shield-account-outline" title="Driver verification" subtitle="Review identity documents and driver licences" count={pendingVerifications} onPress={() => onOpen("verifications")} />',
    1,
)
component_marker = "function VerificationList({ items, onReview }: { items: AdminVerificationListItem[]; onReview: (driverId: string) => void }) {"
if component_marker not in text:
    raise SystemExit("admin verification component marker not found")
profile_component = '''function ProfilePhotoList({ items, onApprove, onReject }: { items: AdminProfilePhotoReviewItem[]; onApprove: (item: AdminProfilePhotoReviewItem) => Promise<void>; onReject: (item: AdminProfilePhotoReviewItem) => void }) {
  const [savingId, setSavingId] = useState<string | null>(null);
  if (!items.length) return <EmptyState title="No profile photos waiting" body="New Driver and Courier profile photos will appear here automatically." />;

  async function approve(item: AdminProfilePhotoReviewItem) {
    if (savingId) return;
    try {
      setSavingId(item.user_id);
      await onApprove(item);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <View style={styles.list}>
      {items.map((item) => (
        <View key={item.user_id} style={styles.recordCard}>
          <View style={styles.recordTopRow}>
            <StatusBadge label={item.is_replacement ? "Replacement" : "New photo"} tone="warning" />
            <Text style={styles.roleText}>{formatStatus(item.role)}</Text>
          </View>
          <Image source={{ uri: item.candidate_url }} style={styles.profilePhotoPreview} resizeMode="cover" />
          <Text style={styles.recordTitle}>{item.name || "Worker"}</Text>
          <Text style={styles.muted}>{item.email || item.city || "No contact on file"}</Text>
          {item.current_approved_url ? <Text style={styles.muted}>Existing approved photo stays live until this replacement is approved.</Text> : null}
          <View style={styles.actionRow}>
            <AppButton title="Approve photo" loading={savingId === item.user_id} disabled={Boolean(savingId)} onPress={() => void approve(item)} style={styles.flexButton} />
            <AppButton title="Reject" variant="danger" disabled={Boolean(savingId)} onPress={() => onReject(item)} style={styles.flexButton} />
          </View>
        </View>
      ))}
    </View>
  );
}

'''
text = text.replace(component_marker, profile_component + component_marker, 1)
text = text.replace(
    '    overview: "Operations",\n    verifications: "Driver verification",',
    '    overview: "Operations",\n    profile_photos: "Profile photo approvals",\n    verifications: "Driver verification",',
    1,
)
text = text.replace(
    'liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#4ADE80" },',
    'liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#FFFFFF" },',
    1,
)
text = text.replace(
    'heroEyebrow: { color: "#86EFAC", fontWeight: "900", fontSize: 11, letterSpacing: 1.8 },',
    'heroEyebrow: { color: "#D1D5DB", fontWeight: "900", fontSize: 11, letterSpacing: 1.8 },',
    1,
)
text = text.replace(
    'sectionEyebrow: { color: colors.primaryGreen, fontWeight: "900", fontSize: 11, letterSpacing: 1.5 },',
    'sectionEyebrow: { color: colors.mutedText, fontWeight: "900", fontSize: 11, letterSpacing: 1.5 },',
    1,
)
text = text.replace(
    '  recordTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },',
    '  profilePhotoPreview: { width: "100%", height: 260, borderRadius: 20, backgroundColor: colors.mutedSurface },\n  recordTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },',
    1,
)
required_admin_tokens = (
    "AdminProfilePhotoReviewItem",
    "listAdminProfilePhotos",
    "updateAdminProfilePhotoStatus",
    "ProfilePhotoList",
    "Approve photo",
    'active === "profile_photos"',
)
if not all(token in text for token in required_admin_tokens):
    raise SystemExit("Admin profile-photo wiring incomplete")
write(control_path, text)

# Standalone verification route and generic selected navigation stay neutral/black.
admin_verifications_path = "mobile/app/(admin)/verifications.tsx"
text = read(admin_verifications_path)
text = text.replace("Review manual driver identity and vehicle submissions.", "Review Driver identity documents and driver licences.", 1)
text = text.replace('backgroundColor: "rgba(17,139,68,0.12)",', 'backgroundColor: "rgba(17,17,17,0.07)",', 1)
text = text.replace('borderColor: "rgba(17,139,68,0.36)",', 'borderColor: "rgba(17,17,17,0.24)",', 1)
text = text.replace('color: colors.primaryGreen,', 'color: colors.charcoal,', 1)
write(admin_verifications_path, text)

bottom_nav_path = "mobile/components/layout/BottomNav.tsx"
text = read(bottom_nav_path)
text = text.replace(
    'const neutralActive = role === "driver" || activeTone === "neutral";',
    'const neutralActive = true;\n  void activeTone;',
    1,
)
write(bottom_nav_path, text)


# Regression coverage for this cleanup contract.
Path("backend/tests/test_build39_final_cleanup.py").write_text('''from app.services.hailing_city_service import DEFAULT_CITY_PRICING, enabled_ride_classes
from app.services.verification_service import REQUIRED_DOCUMENTS, REQUIRED_DOCUMENT_TYPES, _normalize_document_type


def test_driver_verification_no_longer_requires_vehicle_registration():
    assert REQUIRED_DOCUMENTS == ["selfie", "identity_document", "driver_license"]
    assert REQUIRED_DOCUMENT_TYPES == {"selfie", "identity_document", "driver_license"}
    assert _normalize_document_type("vehicle_registration_or_logbook") == "vehicle_registration_or_logbook"


def test_all_launch_ride_classes_have_one_enabled_source_of_truth():
    assert all(DEFAULT_CITY_PRICING[ride_class]["enabled"] is True for ride_class in ("ECONOMY", "COMFORT", "XL"))
    stale = {"pricing": {"ECONOMY": {"enabled": True}, "COMFORT": {"enabled": False}, "XL": {"enabled": False}}}
    assert enabled_ride_classes(stale) == ["ECONOMY", "COMFORT", "XL"]
''')

Path("mobile/__tests__/build39-final-cleanup.test.ts").write_text('''import fs from "fs";
import path from "path";

const root = path.resolve(__dirname, "..");
const readSource = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("Build 39 final cleanup contract", () => {
  it("routes Customer Ride only into Ride Now", () => {
    const source = readSource("app/(shared)/services.tsx");
    expect(source).toContain("flow=hailing");
    expect(source).not.toContain("/(customer)/search");
    expect(source).not.toContain("city-to-city");
  });

  it("keeps Driver verification to selfie, identity and licence", () => {
    const source = readSource("app/(shared)/verification.tsx");
    expect(source).not.toContain("vehicle_registration_or_logbook");
    expect(source).not.toContain("vehicle record");
    expect(source).toContain("driver_license");
  });

  it("uses a Reduce-Motion-aware nearby-driver radar", () => {
    const source = readSource("app/(customer)/hail/searching.tsx");
    expect(source).toContain("DriverSearchRadar");
    expect(source).toContain("AccessibilityInfo");
    expect(source).toContain('activeTone="neutral"');
  });

  it("wires profile-photo approval into Admin", () => {
    const source = readSource("components/admin/AdminControlCenter.tsx");
    expect(source).toContain("listAdminProfilePhotos");
    expect(source).toContain("ProfilePhotoList");
    expect(source).toContain("Approve photo");
  });

  it("ships the transparent Comfort production asset", () => {
    const png = fs.readFileSync(path.join(root, "assets/images/hailing/comfort-executive.png"));
    expect([4, 6]).toContain(png.readUInt8(25));
    expect(png.length).toBeLessThan(100_000);
  });
});
''')

# Final source-level guards before CI gets a chance to run.
assert "/(customer)/search" not in read("mobile/app/(shared)/services.tsx")
assert "vehicle_registration_or_logbook" not in read("mobile/app/(shared)/verification.tsx")
assert "LAUNCH_RIDE_CLASSES" in read(city_path)
assert '"COMFORT": {\n        "enabled": True' in read(city_path)
assert '"XL": {\n        "enabled": True' in read(city_path)
assert "_zimbabwe_geocode_query" in read(routing_path)
assert "Beitbridge" in read(routing_path) and "Chitungwiza" in read(routing_path)
assert "ProfilePhotoList" in read(control_path)
assert "DriverSearchRadar" in read(search_path)
print("Build 39 cleanup source patch applied successfully")
