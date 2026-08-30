import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { RideClassVehicle } from "../../components/hailing/RideClassVehicle";
import { AppNotice } from "../../components/ui/AppNotice";
import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";
import { useHailingDriverWorkspace } from "../../hooks/useHailing";
import { acceptHailingOffer, declineHailingOffer, goHailingDriverOffline, goHailingDriverOnline, resolveHailingServiceArea } from "../../services/hailingService";
import { getCurrentDeviceLocation } from "../../services/locationService";
import { HailingRideClass } from "../../types/hailing.types";

export default function DriverHailingScreen() {
  const router = useRouter();
  const { status, offer, loading, refreshing, error, reload, setOffer } = useHailingDriverWorkspace(true);
  const [rideClass, setRideClass] = useState<HailingRideClass>("ECONOMY");
  const [cityName, setCityName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function goOnline() {
    try {
      setBusy(true);
      setNotice(null);
      const location = await getCurrentDeviceLocation();
      const resolved = await resolveHailingServiceArea({ latitude: location.latitude, longitude: location.longitude });
      const city = resolved.service_area;
      if (!city || !resolved.enabled) {
        setNotice("Ride Now is not available from your current city yet.");
        return;
      }
      await goHailingDriverOnline({
        city_id: city.id,
        ride_class: rideClass,
        location: { latitude: location.latitude, longitude: location.longitude },
      });
      setCityName(city.name);
      reload();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Unable to go online.");
    } finally {
      setBusy(false);
    }
  }

  async function goOffline() {
    try {
      setBusy(true);
      await goHailingDriverOffline();
      reload();
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
      const trip = await acceptHailingOffer(offer.id);
      setOffer(null);
      router.push(`/(driver)/hailing/trip/${trip.id}` as never);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Ride already accepted or expired.");
      reload();
    } finally {
      setBusy(false);
    }
  }

  async function decline() {
    if (!offer) return;
    try {
      setBusy(true);
      await declineHailingOffer(offer.id);
      setOffer(null);
      reload();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Unable to decline this request.");
    } finally {
      setBusy(false);
    }
  }

  const online = Boolean(status?.online);
  const activeTrip = status?.active_trip;

  return (
    <Screen navRole="driver" refreshing={refreshing || loading} onRefresh={reload}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>RIDE NOW DRIVER</Text>
        <Text style={styles.title}>{online ? "You’re online" : "Go online for local rides"}</Text>
        <Text style={styles.body}>Ride Now keeps local hailing separate from your intercity posted trips.</Text>
      </View>

      {error ? <AppNotice message={error} actionLabel="Retry" onAction={reload} /> : null}
      {notice ? <AppNotice message={notice} onDismiss={() => setNotice(null)} /> : null}

      <View style={styles.statusCard}>
        <View style={[styles.statusIcon, online && styles.statusIconOnline]}><MaterialCommunityIcons name={online ? "car-connected" : "car-off"} size={27} color={online ? "#FFFFFF" : v2Theme.colors.ink} /></View>
        <View style={styles.flex}>
          <Text style={styles.statusTitle}>{online ? "Available for Ride Now" : "Offline"}</Text>
          <Text style={styles.statusBody}>{cityName || status?.presence?.city_id || "Your approved city is checked by the server."}</Text>
        </View>
      </View>

      {!online ? (
        <View style={styles.classCard}>
          <Text style={styles.sectionTitle}>Ride class</Text>
          <View style={styles.classGrid}>
            {(["ECONOMY", "COMFORT", "XL"] as const).map((option) => (
              <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: rideClass === option }} onPress={() => setRideClass(option)} style={({ pressed }) => [styles.classPill, rideClass === option && styles.classPillActive, pressed && styles.pressed]}>
                <RideClassVehicle rideClass={option} compact />
                <Text style={[styles.classText, rideClass === option && styles.classTextActive]}>{option}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {offer ? (
        <View style={styles.offerCard}>
          <Text style={styles.eyebrow}>NEW REQUEST</Text>
          <Text style={styles.offerTitle}>{offer.trip.pickup.formatted_address}</Text>
          <Text style={styles.offerBody}>To {offer.trip.dropoff.formatted_address}</Text>
          <Text style={styles.offerMeta}>${offer.trip.fare.total_fare.toFixed(2)} · {offer.trip.route.distance_km.toFixed(1)} km · {offer.trip.ride_class}</Text>
          <View style={styles.offerActions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Accept Ride Now request" disabled={busy} onPress={accept} style={({ pressed }) => [styles.accept, busy && styles.disabled, pressed && styles.pressed]}><Text style={styles.acceptText}>Accept</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Decline Ride Now request" disabled={busy} onPress={decline} style={({ pressed }) => [styles.decline, busy && styles.disabled, pressed && styles.pressed]}><Text style={styles.declineText}>Decline</Text></Pressable>
          </View>
        </View>
      ) : null}

      {activeTrip ? (
        <Pressable accessibilityRole="button" onPress={() => router.push(`/(driver)/hailing/trip/${activeTrip.id}` as never)} style={({ pressed }) => [styles.activeTrip, pressed && styles.pressed]}>
          <Text style={styles.activeTitle}>Open active hailing trip</Text>
          <Text style={styles.activeBody}>{activeTrip.status.replaceAll("_", " ")}</Text>
        </Pressable>
      ) : null}

      <View style={styles.metrics}>
        <Metric label="Today" value={String(status?.stats.rides_today || 0)} />
        <Metric label="Gross" value={`$${(status?.stats.gross_fares || 0).toFixed(2)}`} />
        <Metric label="Est. net" value={`$${(status?.stats.estimated_net || 0).toFixed(2)}`} />
      </View>

      <Pressable accessibilityRole="button" accessibilityLabel={online ? "Go offline" : "Go online"} disabled={busy} onPress={online ? goOffline : goOnline} style={({ pressed }) => [online ? styles.offlineButton : styles.onlineButton, busy && styles.disabled, pressed && styles.pressed]}>
        <Text style={online ? styles.offlineText : styles.onlineText}>{busy ? "Updating..." : online ? "Go offline" : "Go online"}</Text>
      </Pressable>
    </Screen>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  hero: { gap: 8 },
  eyebrow: { color: v2Theme.colors.brandStrong, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: v2Theme.colors.ink, fontSize: 31, lineHeight: 36, fontWeight: "900", letterSpacing: -1 },
  body: { color: v2Theme.colors.inkSecondary, fontSize: 13, lineHeight: 19 },
  statusCard: { minHeight: 92, borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, padding: 15, flexDirection: "row", alignItems: "center", gap: 13 },
  statusIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  statusIconOnline: { backgroundColor: v2Theme.colors.brand },
  statusTitle: { color: v2Theme.colors.ink, fontSize: 16, fontWeight: "900" },
  statusBody: { color: v2Theme.colors.inkSecondary, fontSize: 11, marginTop: 3 },
  classCard: { gap: 10 },
  sectionTitle: { color: v2Theme.colors.ink, fontSize: 17, fontWeight: "900" },
  classGrid: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  classPill: { minHeight: 82, minWidth: 104, borderRadius: 24, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, alignItems: "center", justifyContent: "center", gap: 3 },
  classPillActive: { backgroundColor: v2Theme.colors.ink, borderColor: v2Theme.colors.ink },
  classText: { color: v2Theme.colors.inkSecondary, fontSize: 11, fontWeight: "900" },
  classTextActive: { color: "#FFFFFF" },
  offerCard: { borderRadius: 30, backgroundColor: v2Theme.colors.ink, padding: 18, gap: 8 },
  offerTitle: { color: "#FFFFFF", fontSize: 19, lineHeight: 24, fontWeight: "900" },
  offerBody: { color: "rgba(255,255,255,0.7)", fontSize: 12, lineHeight: 17 },
  offerMeta: { color: "#8FE6AE", fontSize: 12, fontWeight: "900" },
  offerActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  accept: { flex: 1, minHeight: 50, borderRadius: 16, backgroundColor: v2Theme.colors.brand, alignItems: "center", justifyContent: "center" },
  acceptText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  decline: { flex: 1, minHeight: 50, borderRadius: 16, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  declineText: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900" },
  activeTrip: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.brandSofter, padding: 15 },
  activeTitle: { color: v2Theme.colors.ink, fontSize: 13, fontWeight: "900" },
  activeBody: { color: v2Theme.colors.inkSecondary, fontSize: 11, marginTop: 3 },
  metrics: { flexDirection: "row", gap: 8 },
  metric: { flex: 1, borderRadius: 19, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 12, gap: 3 },
  metricValue: { color: v2Theme.colors.ink, fontSize: 18, fontWeight: "900" },
  metricLabel: { color: v2Theme.colors.inkTertiary, fontSize: 9, fontWeight: "900" },
  onlineButton: { minHeight: 56, borderRadius: 18, backgroundColor: v2Theme.colors.brand, alignItems: "center", justifyContent: "center" },
  onlineText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  offlineButton: { minHeight: 56, borderRadius: 18, backgroundColor: v2Theme.colors.dangerSoft, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(200,69,69,0.35)", alignItems: "center", justifyContent: "center" },
  offlineText: { color: v2Theme.colors.danger, fontSize: 14, fontWeight: "900" },
  flex: { flex: 1 },
  disabled: { opacity: 0.48 },
  pressed: { opacity: 0.72 },
});
