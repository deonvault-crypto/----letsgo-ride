from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"Expected patch anchor not found in {path}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1))


# 1) One-shot cold-start active job restoration. It intentionally runs once per
# authenticated session so a user can still leave a live job to browse another
# screen without the router repeatedly bouncing them back.
root = Path("mobile/app/_layout.tsx")
text = root.read_text()
replace_from = 'import { Stack, useRouter, useSegments } from "expo-router";\nimport { useEffect } from "react";'
replace_to = 'import { Stack, useRouter, useSegments } from "expo-router";\nimport { useEffect, useRef } from "react";'
if replace_from not in text:
    raise SystemExit("Root layout React import anchor missing")
text = text.replace(replace_from, replace_to, 1)
replace_from = 'import { resolveNotificationRoute } from "../services/notificationRouting";\nimport { configureNotificationHandler } from "../services/pushNotificationService";'
replace_to = 'import { getActiveHailingTrip, getHailingDriverStatus } from "../services/hailingService";\nimport { resolveNotificationRoute } from "../services/notificationRouting";\nimport { getActiveCourierDelivery } from "../services/operationsService";\nimport { configureNotificationHandler } from "../services/pushNotificationService";\n\n// Define native background tasks from the app entry tree. Importing these modules\n// registers TaskManager tasks but does not start location tracking.\nimport "../services/hailingBackgroundLocation";\nimport "../services/courierBackgroundLocation";'
if replace_from not in text:
    raise SystemExit("Root layout service import anchor missing")
text = text.replace(replace_from, replace_to, 1)
anchor = "function SessionShellRouter() {"
if anchor not in text:
    raise SystemExit("SessionShellRouter anchor missing")
recovery = '''function ActiveJobRecoveryRouter() {
  const router = useRouter();
  const { user, loading, isGuest } = useSession();
  const attemptedFor = useRef<string | null>(null);

  useEffect(() => {
    if (loading || isGuest || !user?.id) return;
    if (!["customer", "driver", "courier"].includes(String(user.role))) return;
    const recoveryKey = `${user.id}:${user.role}`;
    if (attemptedFor.current === recoveryKey) return;
    attemptedFor.current = recoveryKey;
    let settled = false;

    void (async () => {
      try {
        if (user.role === "driver") {
          const status = await getHailingDriverStatus();
          if (settled) return;
          if (status.active_trip?.id) {
            router.replace(`/(driver)/hailing/trip/${status.active_trip.id}` as never);
          } else if (status.offer?.id) {
            router.replace("/(driver)/hailing" as never);
          }
          return;
        }
        if (user.role === "courier") {
          const active = await getActiveCourierDelivery();
          if (!settled && active?.id) router.replace(`/(courier)/delivery/${active.id}` as never);
          return;
        }
        const active = await getActiveHailingTrip();
        if (settled || !active?.id) return;
        if (active.status === "SEARCHING") router.replace("/(customer)/hail" as never);
        else router.replace(`/(customer)/hail/trip/${active.id}` as never);
      } catch {
        // A transient startup network failure must not block normal app launch.
        if (!settled && attemptedFor.current === recoveryKey) attemptedFor.current = null;
      }
    })();

    return () => { settled = true; };
  }, [isGuest, loading, router, user?.id, user?.role]);
  return null;
}

'''
text = text.replace(anchor, recovery + anchor, 1)
mount_from = "            <NotificationResponseRouter />\n            <SessionShellRouter />"
mount_to = "            <NotificationResponseRouter />\n            <SessionShellRouter />\n            <ActiveJobRecoveryRouter />"
if mount_from not in text:
    raise SystemExit("Root layout recovery mount anchor missing")
root.write_text(text.replace(mount_from, mount_to, 1))


# 2) Payment method labels must reflect the real trip, never hardcode Cash.
replace_once(
    "mobile/app/(customer)/hail/trip/[id].tsx",
    '<Text style={styles.fareLine}>Cash fare ${trip.fare.total_fare.toFixed(2)} · {trip.route.distance_km.toFixed(1)} km · {trip.ride_class}</Text>',
    '<Text style={styles.fareLine}>{trip.payment_method === "card" ? "Card fare" : "Cash fare"} ${trip.fare.total_fare.toFixed(2)} · {trip.route.distance_km.toFixed(1)} km · {trip.ride_class}</Text>',
)
replace_once(
    "mobile/app/(driver)/hailing/trip/[id].tsx",
    '<Text style={styles.meta}>Cash</Text>',
    '<Text style={styles.meta}>{trip.payment_method === "card" ? "Card" : "Cash"}</Text>',
)


# 3) Courier background tracking during active deliveries.
Path("mobile/services/courierBackgroundLocation.ts").write_text(r'''import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";

import { ApiRequestError } from "./api";
import { updateCourierLocation } from "./courierService";

export const COURIER_BACKGROUND_TASK = "letsgoride-courier-background-location";
const ACTIVE_DELIVERY_KEY = "letsgoride.courier.background-delivery-id";
const ACTIVE_STATUSES = new Set(["ASSIGNED", "COURIER_TO_PICKUP", "PICKED_UP", "IN_TRANSIT", "ARRIVING"]);

export type CourierBackgroundLocationPermissionState = {
  enabled: boolean;
  canAskAgain: boolean;
  requiresSettings: boolean;
};

function locationPayload(location: Location.LocationObject) {
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    heading: typeof location.coords.heading === "number" && location.coords.heading >= 0 ? location.coords.heading : null,
    speed: typeof location.coords.speed === "number" && location.coords.speed >= 0 ? location.coords.speed : null,
    accuracy: typeof location.coords.accuracy === "number" && location.coords.accuracy >= 0 ? location.coords.accuracy : null,
    recorded_at: new Date(location.timestamp).toISOString(),
  };
}

async function stopTaskAndClearDelivery() {
  await SecureStore.deleteItemAsync(ACTIVE_DELIVERY_KEY).catch(() => undefined);
  const running = await Location.hasStartedLocationUpdatesAsync(COURIER_BACKGROUND_TASK).catch(() => false);
  if (running) await Location.stopLocationUpdatesAsync(COURIER_BACKGROUND_TASK).catch(() => undefined);
}

if (Platform.OS !== "web" && !TaskManager.isTaskDefined(COURIER_BACKGROUND_TASK)) {
  TaskManager.defineTask(COURIER_BACKGROUND_TASK, async ({ data, error }) => {
    if (error) return;
    const deliveryId = await SecureStore.getItemAsync(ACTIVE_DELIVERY_KEY).catch(() => null);
    if (!deliveryId) {
      await stopTaskAndClearDelivery();
      return;
    }
    const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations || [];
    const latest = locations[locations.length - 1];
    if (!latest) return;
    try {
      const delivery = await updateCourierLocation(deliveryId, locationPayload(latest));
      if (!ACTIVE_STATUSES.has(delivery.status)) await stopTaskAndClearDelivery();
    } catch (err) {
      if (err instanceof ApiRequestError && [400, 401, 403, 404].includes(err.status || 0)) {
        await stopTaskAndClearDelivery();
      }
      // Temporary network/provider failures keep the task registered for recovery.
    }
  });
}

function permissionState(response: Location.PermissionResponse): CourierBackgroundLocationPermissionState {
  return {
    enabled: response.granted,
    canAskAgain: response.canAskAgain,
    requiresSettings: !response.granted && !response.canAskAgain,
  };
}

export async function getCourierBackgroundLocationPermissionState() {
  if (Platform.OS === "web") return { enabled: false, canAskAgain: false, requiresSettings: false };
  return permissionState(await Location.getBackgroundPermissionsAsync());
}

export async function requestCourierBackgroundLocationPermission() {
  const foreground = await Location.getForegroundPermissionsAsync();
  if (!foreground.granted) {
    const requested = await Location.requestForegroundPermissionsAsync();
    if (!requested.granted) {
      return { enabled: false, canAskAgain: requested.canAskAgain, requiresSettings: !requested.canAskAgain };
    }
  }
  return permissionState(await Location.requestBackgroundPermissionsAsync());
}

export async function startCourierBackgroundDeliveryTracking(deliveryId: string) {
  if (Platform.OS === "web") return false;
  const permission = await getCourierBackgroundLocationPermissionState();
  if (!permission.enabled) return false;
  await SecureStore.setItemAsync(ACTIVE_DELIVERY_KEY, deliveryId);
  const running = await Location.hasStartedLocationUpdatesAsync(COURIER_BACKGROUND_TASK).catch(() => false);
  if (running) return true;
  await Location.startLocationUpdatesAsync(COURIER_BACKGROUND_TASK, {
    accuracy: Location.Accuracy.High,
    distanceInterval: 25,
    timeInterval: 10000,
    deferredUpdatesDistance: 40,
    deferredUpdatesInterval: 15000,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.AutomotiveNavigation,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "LetsGoRide active delivery",
      notificationBody: "Sharing your location for the active delivery.",
      notificationColor: "#111111",
      killServiceOnDestroy: false,
    },
  });
  return true;
}

export async function stopCourierBackgroundDeliveryTracking() {
  if (Platform.OS === "web") return;
  await stopTaskAndClearDelivery();
}
''')

Path("mobile/components/courier/CourierLocationSync.tsx").parent.mkdir(parents=True, exist_ok=True)
Path("mobile/components/courier/CourierLocationSync.tsx").write_text(r'''import { usePathname } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";

import { useCourierWorkspace } from "../../contexts/CourierWorkspaceContext";
import {
  startCourierBackgroundDeliveryTracking,
  stopCourierBackgroundDeliveryTracking,
} from "../../services/courierBackgroundLocation";
import { updateCourierLocation } from "../../services/courierService";
import {
  DeviceLocation,
  isReliableCourierLocation,
  watchForegroundLocation,
} from "../../services/locationService";

const ACTIVE_STATUSES = new Set(["ASSIGNED", "COURIER_TO_PICKUP", "PICKED_UP", "IN_TRANSIT", "ARRIVING"]);
type LocationSubscription = { remove: () => void };

export function CourierLocationSync() {
  const pathname = usePathname();
  const { active } = useCourierWorkspace();
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const watcher = useRef<LocationSubscription | null>(null);
  const generation = useRef(0);
  const writeInFlight = useRef(false);
  const lastAccepted = useRef<DeviceLocation | null>(null);

  const stopForeground = useCallback(() => {
    generation.current += 1;
    watcher.current?.remove();
    watcher.current = null;
    lastAccepted.current = null;
  }, []);

  const startForeground = useCallback(async (deliveryId: string) => {
    if (watcher.current || appState.current !== "active" || pathname.includes("/delivery/")) return;
    const watchGeneration = ++generation.current;
    const next = await watchForegroundLocation((location) => {
      if (watchGeneration !== generation.current || writeInFlight.current) return;
      if (!isReliableCourierLocation(location, lastAccepted.current)) return;
      lastAccepted.current = location;
      writeInFlight.current = true;
      void updateCourierLocation(deliveryId, {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        heading: location.heading,
        speed: location.speed,
        recorded_at: new Date(location.timestamp).toISOString(),
      }).catch(() => undefined).finally(() => { writeInFlight.current = false; });
    }, () => undefined, { timeInterval: 5000, distanceInterval: 10 });
    if (watchGeneration !== generation.current || appState.current !== "active" || pathname.includes("/delivery/")) {
      next.remove();
      return;
    }
    watcher.current = next;
  }, [pathname]);

  const reconcile = useCallback(async () => {
    if (!active?.id || !ACTIVE_STATUSES.has(active.status)) {
      stopForeground();
      await stopCourierBackgroundDeliveryTracking();
      return;
    }
    if (appState.current === "active") {
      await stopCourierBackgroundDeliveryTracking();
      if (pathname.includes("/delivery/")) stopForeground();
      else await startForeground(active.id);
      return;
    }
    stopForeground();
    await startCourierBackgroundDeliveryTracking(active.id);
  }, [active?.id, active?.status, pathname, startForeground, stopForeground]);

  useEffect(() => {
    void reconcile().catch(() => undefined);
  }, [reconcile]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      appState.current = next;
      void reconcile().catch(() => undefined);
    });
    return () => {
      subscription.remove();
      stopForeground();
      // Do not stop the OS task here: React can unmount because the app backgrounded.
    };
  }, [reconcile, stopForeground]);

  return null;
}
''')

Path("mobile/components/courier/CourierBackgroundLocationPrompt.tsx").write_text(r'''import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { v2Theme } from "../../constants/v2Theme";
import { useCourierWorkspace } from "../../contexts/CourierWorkspaceContext";
import {
  CourierBackgroundLocationPermissionState,
  getCourierBackgroundLocationPermissionState,
  requestCourierBackgroundLocationPermission,
  startCourierBackgroundDeliveryTracking,
} from "../../services/courierBackgroundLocation";
import { openLocationSettings } from "../../services/locationService";

const ACTIVE_STATUSES = new Set(["ASSIGNED", "COURIER_TO_PICKUP", "PICKED_UP", "IN_TRANSIT", "ARRIVING"]);

export function CourierBackgroundLocationPrompt() {
  const insets = useSafeAreaInsets();
  const { active } = useCourierWorkspace();
  const [permission, setPermission] = useState<CourierBackgroundLocationPermissionState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const dismissedFor = useRef<string | null>(null);
  const openedSettings = useRef(false);
  const relevant = Boolean(active?.id && ACTIVE_STATUSES.has(active.status));

  const inspect = useCallback(async () => {
    setPermission(await getCourierBackgroundLocationPermissionState());
  }, []);

  useEffect(() => {
    if (!relevant) {
      setPermission(null);
      dismissedFor.current = null;
      return;
    }
    void inspect().catch(() => undefined);
  }, [active?.id, inspect, relevant]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active" || !openedSettings.current) return;
      openedSettings.current = false;
      void inspect().catch(() => undefined);
    });
    return () => subscription.remove();
  }, [inspect]);

  if (!relevant || !active?.id || !permission || permission.enabled || dismissedFor.current === active.id) return null;

  async function enable() {
    try {
      setBusy(true);
      setMessage(null);
      if (permission?.requiresSettings) {
        openedSettings.current = true;
        await openLocationSettings();
        return;
      }
      const next = await requestCourierBackgroundLocationPermission();
      setPermission(next);
      if (next.enabled && active?.id && AppState.current !== "active") {
        await startCourierBackgroundDeliveryTracking(active.id);
      } else if (!next.enabled) {
        setMessage("Background location is still off. Keep LetsGoRide open during the delivery, or enable it later in Settings.");
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Background location could not be enabled.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <View style={[styles.card, { bottom: Math.max(insets.bottom, 10) + 78 }]}>
        <View style={styles.icon}><MaterialCommunityIcons name="map-marker-path" size={22} color="#111111" /></View>
        <View style={styles.copy}>
          <Text style={styles.eyebrow}>ACTIVE DELIVERY</Text>
          <Text style={styles.title}>Keep the customer’s map moving if you switch apps</Text>
          <Text style={styles.body}>Background location is used only while an active delivery needs your position. Tracking stops when the delivery ends.</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => void enable()} style={[styles.primary, busy && styles.disabled]}><Text style={styles.primaryText}>{busy ? "Opening…" : permission.requiresSettings ? "Open Settings" : "Allow while delivering"}</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => { dismissedFor.current = active.id; setPermission(null); }} style={styles.secondary}><Text style={styles.secondaryText}>Not now</Text></Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { position: "absolute", left: 12, right: 12, borderRadius: 23, backgroundColor: "rgba(255,255,255,0.99)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(0,0,0,0.13)", padding: 14, flexDirection: "row", alignItems: "flex-start", gap: 11, shadowColor: "#000000", shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  icon: { width: 43, height: 43, borderRadius: 15, backgroundColor: "#F0F0ED", alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, gap: 4 },
  eyebrow: { color: v2Theme.colors.inkTertiary, fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  title: { color: v2Theme.colors.ink, fontSize: 14, lineHeight: 18, fontWeight: "900" },
  body: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14 },
  message: { color: v2Theme.colors.danger, fontSize: 9, lineHeight: 13, fontWeight: "700" },
  actions: { flexDirection: "row", gap: 7, marginTop: 6 },
  primary: { flex: 1, minHeight: 40, borderRadius: 13, backgroundColor: "#111111", alignItems: "center", justifyContent: "center" },
  primaryText: { color: "#FFFFFF", fontSize: 9, fontWeight: "900" },
  secondary: { minWidth: 74, minHeight: 40, borderRadius: 13, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  secondaryText: { color: v2Theme.colors.ink, fontSize: 9, fontWeight: "900" },
  disabled: { opacity: 0.5 },
});
''')

courier_layout = Path("mobile/app/(courier)/_layout.tsx")
text = courier_layout.read_text()
import_anchor = 'import { CourierWorkspaceProvider } from "../../contexts/CourierWorkspaceContext";'
if import_anchor not in text:
    raise SystemExit("Courier layout import anchor missing")
text = text.replace(
    import_anchor,
    'import { CourierBackgroundLocationPrompt } from "../../components/courier/CourierBackgroundLocationPrompt";\nimport { CourierLocationSync } from "../../components/courier/CourierLocationSync";\nimport { CourierWorkspaceProvider } from "../../contexts/CourierWorkspaceContext";',
    1,
)
text = text.replace(
    "    <CourierWorkspaceProvider>\n      <Stack",
    "    <CourierWorkspaceProvider>\n      <CourierLocationSync />\n      <Stack",
    1,
)
text = text.replace(
    "      </Stack>\n    </CourierWorkspaceProvider>",
    "      </Stack>\n      <CourierBackgroundLocationPrompt />\n    </CourierWorkspaceProvider>",
    1,
)
courier_layout.write_text(text)


# 4) Store permission copy must accurately describe both worker products.
app_json = Path("mobile/app.json")
text = app_json.read_text()
old_copy = "For Drivers, LetsGoRide can continue sharing location during an active Ride Now trip when the app is in the background so the rider can follow live trip progress. This stops when active-trip tracking ends."
new_copy = "For Drivers and Couriers, LetsGoRide can continue sharing location during an active Ride Now trip or delivery when the app is in the background so the customer can follow live progress. Tracking stops when the active job ends."
if text.count(old_copy) != 2:
    raise SystemExit(f"Expected two background location purpose strings; found {text.count(old_copy)}")
app_json.write_text(text.replace(old_copy, new_copy))


# 5) Refine the custom, copyright-safe service-class artwork without changing
# the approved Ride Now layout or adding heavy raster assets.
car = Path("mobile/components/hailing/RideClassCar.tsx")
text = car.read_text()
visual_anchor = '      <View style={[styles.lowerTrim, { left: car.bodyLeft + 8, width: car.bodyWidth - 16, bottom: car.bodyBottom + 5 }]} />\n      <Wheel left={car.rearWheelLeft} />'
visual_replacement = '      <View style={[styles.lowerTrim, { left: car.bodyLeft + 8, width: car.bodyWidth - 16, bottom: car.bodyBottom + 5 }]} />\n      <View style={[styles.frontFascia, { left: car.bodyLeft + car.bodyWidth - 13, bottom: car.bodyBottom + 4 }]}><View style={styles.grille} /></View>\n      <View style={[styles.rearBumper, { left: car.bodyLeft + 1, bottom: car.bodyBottom + 3 }]} />\n      <View style={[styles.mirror, styles.mirrorRear, { left: car.roofLeft - 4, bottom: car.roofBottom + 4 }]} />\n      <View style={[styles.mirror, styles.mirrorFront, { left: car.roofLeft + car.roofWidth - 1, bottom: car.roofBottom + 4 }]} />\n      {isComfort ? <View style={[styles.chromeLine, { left: car.bodyLeft + 13, width: car.bodyWidth - 27, bottom: car.bodyBottom + 8 }]} /> : null}\n      {isXl ? <><View style={[styles.roofRail, { left: car.roofLeft + 6, width: car.roofWidth - 12, bottom: car.roofBottom + car.roofHeight + 1 }]} /><View style={[styles.xlQuarterGlass, { left: car.windowLeft + 3, bottom: car.roofBottom + 5 }]} /></> : null}\n      <View style={[styles.brandAccent, { left: car.bodyLeft + car.bodyWidth - 22, bottom: car.bodyBottom + 7 }]} />\n      <Wheel left={car.rearWheelLeft} />'
if visual_anchor not in text:
    raise SystemExit("RideClassCar visual anchor missing")
text = text.replace(visual_anchor, visual_replacement, 1)
style_anchor = "  wheel: {\n"
style_replacement = '  frontFascia: { position: "absolute", width: 12, height: 12, borderTopRightRadius: 7, borderBottomRightRadius: 6, backgroundColor: "rgba(7,8,9,0.72)", borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: "rgba(255,255,255,0.18)", justifyContent: "center", alignItems: "center" },\n  grille: { width: 7, height: 5, borderRadius: 2, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(218,223,226,0.55)", backgroundColor: "rgba(0,0,0,0.42)" },\n  rearBumper: { position: "absolute", width: 8, height: 4, borderRadius: 2, backgroundColor: "rgba(9,10,11,0.75)" },\n  mirror: { position: "absolute", width: 8, height: 4, borderRadius: 3, backgroundColor: "#25292D", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.2)" },\n  mirrorRear: { transform: [{ rotate: "-9deg" }] },\n  mirrorFront: { transform: [{ rotate: "8deg" }] },\n  chromeLine: { position: "absolute", height: StyleSheet.hairlineWidth, backgroundColor: "rgba(225,230,233,0.62)" },\n  roofRail: { position: "absolute", height: 2, borderRadius: 2, backgroundColor: "rgba(205,211,215,0.46)" },\n  xlQuarterGlass: { position: "absolute", width: 11, height: 8, borderRadius: 3, backgroundColor: "rgba(130,151,162,0.7)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.38)" },\n  brandAccent: { position: "absolute", width: 7, height: 2, borderRadius: 2, backgroundColor: "#54C779", opacity: 0.72 },\n  wheel: {\n'
if style_anchor not in text:
    raise SystemExit("RideClassCar style anchor missing")
car.write_text(text.replace(style_anchor, style_replacement, 1))


# 6) Regression contracts for the exact product behavior we must not lose again.
Path("mobile/__tests__/build34-release-contract.test.ts").write_text(r'''import fs from "fs";
import path from "path";

const mobileRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(mobileRoot, "..");
const readMobile = (relative: string) => fs.readFileSync(path.join(mobileRoot, relative), "utf8");
const readRepo = (relative: string) => fs.readFileSync(path.join(repoRoot, relative), "utf8");

describe("Build 34 release recovery contract", () => {
  it("keeps Ride Now map-first and realtime recovery", () => {
    expect(readMobile("app/(driver)/hailing.tsx")).toContain("HailingMapBackdrop");
    expect(readMobile("app/(driver)/hailing/trip/[id].tsx")).toContain("HailingMapBackdrop");
    const hook = readMobile("hooks/useHailing.ts");
    expect(hook).toContain("CONNECTED_RECONCILIATION_MS = 15000");
    expect(hook).toContain("RECOVERY_REFRESH_MS = 6500");
    expect(hook).toContain('event.resource_type === "hailing_offer" || event.resource_type === "hailing_trip"');
  });

  it("restores active jobs once at cold start", () => {
    const layout = readMobile("app/_layout.tsx");
    expect(layout).toContain("function ActiveJobRecoveryRouter()");
    expect(layout).toContain("getActiveHailingTrip");
    expect(layout).toContain("getHailingDriverStatus");
    expect(layout).toContain("getActiveCourierDelivery");
  });

  it("never hardcodes cash on a card hailing trip", () => {
    expect(readMobile("app/(customer)/hail/trip/[id].tsx")).toContain('trip.payment_method === "card" ? "Card fare" : "Cash fare"');
    expect(readMobile("app/(driver)/hailing/trip/[id].tsx")).toContain('trip.payment_method === "card" ? "Card" : "Cash"');
  });

  it("keeps cash driver economics at 100 percent and platform fee card-only", () => {
    const wallet = readRepo("backend/app/services/worker_wallet_service.py");
    expect(wallet).toContain('"cash_policy": "driver_keeps_100_percent"');
    expect(wallet).toContain('"platform_fee_policy": "card_only"');
    expect(wallet).toContain('"amount_due_to_platform_usd": 0.0');
  });

  it("registers courier background tracking only around active deliveries", () => {
    const service = readMobile("services/courierBackgroundLocation.ts");
    expect(service).toContain("COURIER_BACKGROUND_TASK");
    expect(service).toContain("startCourierBackgroundDeliveryTracking");
    const layout = readMobile("app/(courier)/_layout.tsx");
    expect(layout).toContain("CourierLocationSync");
    expect(layout).toContain("CourierBackgroundLocationPrompt");
  });
});
''')
