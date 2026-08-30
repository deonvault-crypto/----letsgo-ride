import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StatusBar, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { HailingMapBackdrop } from "../../components/hailing/HailingMapBackdrop";
import { AppNotice } from "../../components/ui/AppNotice";
import { v2Theme } from "../../constants/v2Theme";
import { useHailingDriverWorkspace } from "../../hooks/useHailing";
import { useHailingDriverLocationSync } from "../../hooks/useHailingDriverLocationSync";
import { acceptHailingOffer, declineHailingOffer, goHailingDriverOffline, goHailingDriverOnline, resolveHailingServiceArea } from "../../services/hailingService";
import { getCurrentDeviceLocation } from "../../services/locationService";
import { HailingCoordinate, HailingRideClass } from "../../types/hailing.types";

const RIDE_BLACK = "#111111";

export default function DriverHailingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status, offer, loading, error, reload, setOffer, realtimeState } = useHailingDriverWorkspace(true);
  const [rideClass, setRideClass] = useState<HailingRideClass>("ECONOMY");
  const [currentLocation, setCurrentLocation] = useState<HailingCoordinate | null>(null);
  const [cityName, setCityName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const online = Boolean(status?.online);
  const activeTrip = status?.active_trip;
  const live = realtimeState === "connected";

  useHailingDriverLocationSync({
    enabled: online && !activeTrip,
    onLocation: (location) => setCurrentLocation({ latitude: location.latitude, longitude: location.longitude }),
    onError: (locationError) => {
      if (/permission|location access/i.test(locationError.message)) setNotice(locationError.message);
    },
  });

  useEffect(() => {
    let mounted = true;
    void getCurrentDeviceLocation().then((location) => {
      if (mounted) setCurrentLocation({ latitude: location.latitude, longitude: location.longitude });
    }).catch(() => undefined);
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!activeTrip?.id) return;
    router.replace(`/(driver)/hailing/trip/${activeTrip.id}` as never);
  }, [activeTrip?.id, router]);

  async function goOnline() {
    try {
      setBusy(true);
      setNotice(null);
      const location = await getCurrentDeviceLocation();
      const point = { latitude: location.latitude, longitude: location.longitude };
      setCurrentLocation(point);
      const resolved = await resolveHailingServiceArea(point);
      const city = resolved.service_area;
      if (!city || !resolved.enabled) {
        setNotice("Ride Now is not available from your current city yet.");
        return;
      }
      await goHailingDriverOnline({ city_id: city.id, ride_class: rideClass, location: point });
      setCityName(city.name);
      await reload();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Unable to go online.");
    } finally {
      setBusy(false);
    }
  }

  async function goOffline() {
    try {
      setBusy(true);
      setNotice(null);
      await goHailingDriverOffline();
      await reload();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Unable to go offline.");
    } finally {
      setBusy(false);
    }
  }

  async function accept() {
    if (!offer) return;
    try {
      setBusy(true);
      setNotice(null);
      const trip = await acceptHailingOffer(offer.id);
      setOffer(null);
      router.replace(`/(driver)/hailing/trip/${trip.id}` as never);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Ride already accepted or expired.");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function decline() {
    if (!offer) return;
    try {
      setBusy(true);
      setNotice(null);
      await declineHailingOffer(offer.id);
      setOffer(null);
      await reload();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Unable to decline this request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView edges={[]} style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <HailingMapBackdrop
        pickup={offer?.trip.pickup}
        dropoff={offer?.trip.dropoff}
        route={offer?.trip.route}
        driverLocation={currentLocation}
        bottomPadding={offer ? 420 : 330}
      />

      <View pointerEvents="box-none" style={[styles.topBar, { top: insets.top + 8 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to Driver home" hitSlop={8} onPress={() => router.replace("/(driver)/home" as never)} style={({ pressed }) => [styles.topButton, pressed && styles.pressed]}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={RIDE_BLACK} />
        </Pressable>
        <View style={styles.statusPill}>
          <View style={[styles.statusDot, online ? styles.statusDotOnline : styles.statusDotOffline]} />
          <Text style={styles.statusPillText}>{online ? (live ? "ONLINE · LIVE" : "ONLINE · SYNCING") : "OFFLINE"}</Text>
        </View>
        <View style={styles.topSpacer} />
      </View>

      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.handle} />
        {notice || error ? <AppNotice message={notice || error || ""} actionLabel="Reconnect" onAction={() => void reload()} onDismiss={() => setNotice(null)} /> : null}

        {offer ? (
          <>
            <Text style={styles.eyebrow}>NEW RIDE REQUEST</Text>
            <Text style={styles.title}>${offer.trip.fare.total_fare.toFixed(2)} · {offer.trip.route.distance_km.toFixed(1)} km</Text>
            <View style={styles.routeCard}>
              <RouteRow icon="circle-slice-8" label="PICKUP" value={offer.trip.pickup.formatted_address} />
              <View style={styles.routeDivider} />
              <RouteRow icon="square" label="DESTINATION" value={offer.trip.dropoff.formatted_address} />
            </View>
            <View style={styles.offerActions}>
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => void accept()} style={({ pressed }) => [styles.accept, busy && styles.disabled, pressed && styles.pressed]}>
                <Text style={styles.acceptText}>{busy ? "Accepting…" : "Accept ride"}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => void decline()} style={({ pressed }) => [styles.decline, busy && styles.disabled, pressed && styles.pressed]}>
                <Text style={styles.declineText}>Decline</Text>
              </Pressable>
            </View>
          </>
        ) : online ? (
          <>
            <Text style={styles.eyebrow}>RIDE NOW DRIVER</Text>
            <Text style={styles.title}>You’re online</Text>
            <Text style={styles.body}>{loading ? "Connecting to live dispatch…" : "Requests appear here in real time. Your live position keeps dispatch accurate while you’re online."}</Text>
            <View style={styles.metrics}>
              <Metric label="Today" value={String(status?.stats.rides_today || 0)} />
              <Metric label="Gross" value={`$${(status?.stats.gross_fares || 0).toFixed(2)}`} />
              <Metric label="Est. net" value={`$${(status?.stats.estimated_net || 0).toFixed(2)}`} />
            </View>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => void goOffline()} style={({ pressed }) => [styles.offlineButton, busy && styles.disabled, pressed && styles.pressed]}>
              <Text style={styles.offlineText}>{busy ? "Going offline…" : "Go offline"}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.eyebrow}>RIDE NOW DRIVER</Text>
            <Text style={styles.title}>Ready for local rides?</Text>
            <Text style={styles.body}>Choose your approved class and go online. The map stays at the centre of your Driver experience.</Text>
            <View style={styles.classGrid}>
              {(["ECONOMY", "COMFORT", "XL"] as const).map((option) => (
                <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: rideClass === option }} onPress={() => setRideClass(option)} style={({ pressed }) => [styles.classPill, rideClass === option && styles.classPillActive, pressed && styles.pressed]}>
                  <Text style={[styles.classText, rideClass === option && styles.classTextActive]}>{option}</Text>
                </Pressable>
              ))}
            </View>
            {cityName ? <Text style={styles.cityLine}>{cityName}</Text> : null}
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => void goOnline()} style={({ pressed }) => [styles.onlineButton, busy && styles.disabled, pressed && styles.pressed]}>
              <Text style={styles.onlineText}>{busy ? "Going online…" : "Go online"}</Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

function RouteRow({ icon, label, value }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.routeRow}>
      <MaterialCommunityIcons name={icon} size={15} color={RIDE_BLACK} />
      <View style={styles.flex}><Text style={styles.routeLabel}>{label}</Text><Text numberOfLines={1} style={styles.routeValue}>{value}</Text></View>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F6F2E9" },
  topBar: { position: "absolute", left: 16, right: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  topButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.96)", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  topSpacer: { width: 48, height: 48 },
  statusPill: { minHeight: 38, paddingHorizontal: 13, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.96)", flexDirection: "row", alignItems: "center", gap: 7, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusDotOnline: { backgroundColor: v2Theme.colors.brand },
  statusDotOffline: { backgroundColor: v2Theme.colors.inkTertiary },
  statusPillText: { color: RIDE_BLACK, fontSize: 10, fontWeight: "900", letterSpacing: 0.9 },
  sheet: { position: "absolute", left: 14, right: 14, bottom: 14, borderRadius: 30, backgroundColor: "rgba(255,255,255,0.98)", paddingHorizontal: 18, paddingTop: 10, gap: 13, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 7 }, elevation: 10 },
  handle: { width: 42, height: 4, borderRadius: 2, backgroundColor: "#D7D4CE", alignSelf: "center", marginBottom: 2 },
  eyebrow: { color: v2Theme.colors.brandStrong, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: RIDE_BLACK, fontSize: 26, lineHeight: 30, fontWeight: "900", letterSpacing: -0.8 },
  body: { color: v2Theme.colors.inkSecondary, fontSize: 12, lineHeight: 18 },
  routeCard: { borderRadius: 19, backgroundColor: v2Theme.colors.surfaceMuted, paddingHorizontal: 13, paddingVertical: 10 },
  routeRow: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 10 },
  routeDivider: { height: StyleSheet.hairlineWidth, backgroundColor: v2Theme.colors.lineStrong, marginLeft: 25 },
  routeLabel: { color: v2Theme.colors.inkTertiary, fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  routeValue: { color: RIDE_BLACK, fontSize: 12, fontWeight: "800", marginTop: 2 },
  offerActions: { flexDirection: "row", gap: 9 },
  accept: { flex: 1.5, minHeight: 56, borderRadius: 18, backgroundColor: RIDE_BLACK, alignItems: "center", justifyContent: "center" },
  acceptText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  decline: { flex: 1, minHeight: 56, borderRadius: 18, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  declineText: { color: RIDE_BLACK, fontSize: 13, fontWeight: "900" },
  classGrid: { flexDirection: "row", gap: 8 },
  classPill: { minHeight: 43, borderRadius: 999, paddingHorizontal: 14, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  classPillActive: { backgroundColor: RIDE_BLACK },
  classText: { color: v2Theme.colors.inkSecondary, fontSize: 10, fontWeight: "900" },
  classTextActive: { color: "#FFFFFF" },
  cityLine: { color: v2Theme.colors.brandStrong, fontSize: 10, fontWeight: "900" },
  metrics: { flexDirection: "row", gap: 8 },
  metric: { flex: 1, borderRadius: 17, backgroundColor: v2Theme.colors.surfaceMuted, padding: 11, gap: 3 },
  metricValue: { color: RIDE_BLACK, fontSize: 17, fontWeight: "900" },
  metricLabel: { color: v2Theme.colors.inkTertiary, fontSize: 8, fontWeight: "900" },
  onlineButton: { minHeight: 56, borderRadius: 18, backgroundColor: RIDE_BLACK, alignItems: "center", justifyContent: "center" },
  onlineText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  offlineButton: { minHeight: 50, borderRadius: 17, backgroundColor: v2Theme.colors.dangerSoft, alignItems: "center", justifyContent: "center" },
  offlineText: { color: v2Theme.colors.danger, fontSize: 12, fontWeight: "900" },
  flex: { flex: 1 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.72 },
});
