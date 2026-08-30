import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Share, StatusBar, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { HailingMapBackdrop } from "../../../../components/hailing/HailingMapBackdrop";
import { BottomNav } from "../../../../components/layout/BottomNav";
import { AppNotice } from "../../../../components/ui/AppNotice";
import { Avatar } from "../../../../components/ui/Avatar";
import { v2Theme } from "../../../../constants/v2Theme";
import { useHailingTripRealtime } from "../../../../hooks/useHailing";
import {
  cancelHailingTrip,
  confirmHailingBoarding,
  openHailingConversation,
  regenerateHailingTripPin,
  sendHailingSafetyEvent,
  shareHailingTrip,
} from "../../../../services/hailingService";
import { HailingTripStatus } from "../../../../types/hailing.types";

const RIDE_BLACK = "#111111";
const SHEET_BOTTOM = v2Theme.control.navHeight + 26;
const TERMINAL = new Set<HailingTripStatus>(["COMPLETED", "CANCELLED_BY_PASSENGER", "CANCELLED_BY_DRIVER", "CANCELLED_BY_ADMIN", "NO_DRIVER_FOUND"]);
const SHAREABLE = new Set<HailingTripStatus>(["DRIVER_ASSIGNED", "DRIVER_EN_ROUTE", "DRIVER_ARRIVED", "PASSENGER_CONFIRMED_BOARDING", "IN_PROGRESS"]);

function statusTitle(status?: HailingTripStatus) {
  switch (status) {
    case "DRIVER_ASSIGNED": return "Driver assigned";
    case "DRIVER_EN_ROUTE": return "Driver on the way";
    case "DRIVER_ARRIVED": return "Your driver is here";
    case "PASSENGER_CONFIRMED_BOARDING": return "Safety PIN ready";
    case "IN_PROGRESS": return "Ride in progress";
    case "COMPLETED": return "Ride completed";
    case "CANCELLED_BY_PASSENGER": return "Ride cancelled";
    case "CANCELLED_BY_DRIVER": return "Driver cancelled";
    case "CANCELLED_BY_ADMIN": return "Ride cancelled";
    case "NO_DRIVER_FOUND": return "No driver found";
    default: return "Restoring your ride…";
  }
}

function statusBody(status?: HailingTripStatus, verifyWithPin = false) {
  switch (status) {
    case "DRIVER_ASSIGNED": return "Your driver accepted the request. Their live position updates as they approach.";
    case "DRIVER_EN_ROUTE": return "Your driver is travelling to the pickup point.";
    case "DRIVER_ARRIVED": return verifyWithPin
      ? "Check the driver, vehicle colour and plate. Use your optional safety PIN when you are ready to leave."
      : "Check the driver, vehicle colour and plate before getting in. The driver can start once you are safely onboard.";
    case "PASSENGER_CONFIRMED_BOARDING": return "Give the one-time safety PIN only to your assigned driver. The trip can start after verification.";
    case "IN_PROGRESS": return "Your trip is active. You can share this live status with someone you trust.";
    case "COMPLETED": return "Your trip is complete. Your receipt and rating are ready.";
    case "CANCELLED_BY_DRIVER": return "The driver could not continue. You can request another ride.";
    case "NO_DRIVER_FOUND": return "No approved driver accepted in time. Try again when you’re ready.";
    case "CANCELLED_BY_PASSENGER":
    case "CANCELLED_BY_ADMIN": return "This ride is closed and no driver is being assigned.";
    default: return "Getting the latest trip state from the server.";
  }
}

export default function CustomerHailingTripScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const tripId = String(params.id || "");
  const { trip, loading, error, reload, setTrip, realtimeState } = useHailingTripRealtime(tripId, Boolean(tripId));
  const [tripPin, setTripPin] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (trip?.status === "SEARCHING") router.replace(`/(customer)/hail/searching?tripId=${encodeURIComponent(trip.id)}` as never);
    if (trip && (!trip.verify_ride_with_pin || trip.trip_pin_verified_at || TERMINAL.has(trip.status) || trip.status === "IN_PROGRESS")) setTripPin(null);
  }, [router, trip?.id, trip?.status, trip?.trip_pin_verified_at, trip?.verify_ride_with_pin]);

  async function perform(name: string, action: () => Promise<void>) {
    try {
      setBusyAction(name);
      setNotice(null);
      await action();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "That action could not be completed.");
    } finally {
      setBusyAction(null);
    }
  }

  function goBack() { router.replace("/(customer)/home" as never); }

  function cancel() {
    if (!trip) return;
    void perform("cancel", async () => {
      const next = await cancelHailingTrip(trip.id, "Passenger cancelled");
      setTrip(next);
      setTripPin(null);
    });
  }

  function safety() {
    if (!trip) return;
    void perform("safety", async () => {
      await sendHailingSafetyEvent(trip.id, { kind: "help_requested", message: "Passenger requested help from the live Ride Now screen." });
      setNotice("LetsGoRide support has been notified. Use local emergency services if you need immediate help.");
    });
  }

  function prepareSafetyPin() {
    if (!trip?.verify_ride_with_pin || trip.status !== "DRIVER_ARRIVED") return;
    void perform("boarding", async () => {
      const next = await confirmHailingBoarding(trip.id);
      setTrip(next);
      if (next.trip_pin) setTripPin(next.trip_pin);
      setNotice("Tell this one-time PIN only to your assigned driver.");
    });
  }

  function regeneratePin() {
    if (!trip) return;
    void perform("pin", async () => {
      const next = await regenerateHailingTripPin(trip.id);
      setTrip(next);
      if (!next.trip_pin) throw new Error("A new PIN could not be generated.");
      setTripPin(next.trip_pin);
      setNotice("A new one-time PIN was generated. The previous PIN no longer works.");
    });
  }

  function messageDriver() {
    if (!trip) return;
    void perform("message", async () => {
      const conversation = await openHailingConversation(trip.id);
      router.push(`/(shared)/conversation/${conversation.id}` as never);
    });
  }

  function shareTrip() {
    if (!trip) return;
    void perform("share", async () => {
      const shared = await shareHailingTrip(trip.id);
      await Share.share({
        title: "LetsGoRide live trip",
        message: `I’m travelling with LetsGoRide. Follow my live trip status: ${shared.share_url}`,
        url: shared.share_url,
      });
    });
  }

  const vehicleName = [trip?.vehicle?.make, trip?.vehicle?.model].filter(Boolean).join(" ");
  const vehicleMeta = [trip?.vehicle?.color, trip?.vehicle?.plate_number || trip?.vehicle?.plate].filter(Boolean).join(" · ");
  const vehicleDescription = [vehicleName || trip?.vehicle?.vehicle, vehicleMeta].filter(Boolean).join(" · ") || "Vehicle details appear after matching";
  const awaitingPin = Boolean(trip?.status === "PASSENGER_CONFIRMED_BOARDING" && trip.verify_ride_with_pin && !trip.trip_pin_verified_at);
  const canCancel = Boolean(trip && ["DRIVER_ASSIGNED", "DRIVER_EN_ROUTE", "DRIVER_ARRIVED", "PASSENGER_CONFIRMED_BOARDING"].includes(trip.status));
  const live = realtimeState === "connected";

  return (
    <SafeAreaView edges={[]} style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <HailingMapBackdrop pickup={trip?.pickup} dropoff={trip?.dropoff} route={trip?.route} driverLocation={trip?.driver_location} bottomPadding={430} />

      <View pointerEvents="box-none" style={[styles.topBar, { top: insets.top + 8 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to Home" hitSlop={8} onPress={goBack} style={({ pressed }) => [styles.topButton, pressed && styles.pressed]}>
          <MaterialCommunityIcons name="chevron-left" size={27} color={RIDE_BLACK} />
        </Pressable>
        <View style={styles.statusPill}><Text numberOfLines={1} style={styles.statusPillText}>{trip ? statusTitle(trip.status) : "RIDE NOW"}</Text></View>
        {!trip || TERMINAL.has(trip.status) ? <View style={styles.topSpacer} /> : (
          <Pressable accessibilityRole="button" accessibilityLabel="Ride safety" hitSlop={8} disabled={busyAction === "safety"} onPress={safety} style={({ pressed }) => [styles.topButton, pressed && styles.pressed]}>
            <MaterialCommunityIcons name="shield-outline" size={21} color={RIDE_BLACK} />
          </Pressable>
        )}
      </View>

      <View style={styles.sheet}>
        <View style={styles.handle} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <View style={styles.headingRow}>
            <View style={styles.flex}>
              <Text style={styles.eyebrow}>RIDE NOW</Text>
              <Text style={styles.title}>{loading && !trip ? "Restoring your ride…" : statusTitle(trip?.status)}</Text>
              <Text style={styles.body}>{statusBody(trip?.status, Boolean(trip?.verify_ride_with_pin))}</Text>
            </View>
            <View accessibilityLabel={live ? "Ride updates connected" : "Ride updates reconnecting"} style={styles.liveBadge}>
              <View style={[styles.liveDot, !live && styles.liveDotSyncing]} />
              <Text style={styles.liveText}>{live ? "LIVE" : "SYNC"}</Text>
            </View>
          </View>

          {loading && !trip ? <View style={styles.skeleton}><View style={styles.skeletonWide} /><View style={styles.skeletonShort} /></View> : null}
          {notice ? <AppNotice message={notice} actionLabel="Reconnect" onAction={() => void reload()} onDismiss={() => setNotice(null)} /> : null}
          {error ? <AppNotice message={error} actionLabel="Reconnect" onAction={() => void reload()} /> : null}

          {trip?.driver && !TERMINAL.has(trip.status) ? (
            <View style={styles.driverCard}>
              <Avatar name={trip.driver.name || "Driver"} imageUri={trip.driver.profile_photo_url || undefined} size={52} />
              <View style={styles.flex}>
                <Text style={styles.driverName}>{trip.driver.name || "Your driver"}</Text>
                <Text style={styles.vehicle}>{vehicleDescription}</Text>
                {typeof trip.driver.rating === "number" ? <Text style={styles.rating}>★ {trip.driver.rating.toFixed(1)}</Text> : <Text style={styles.newDriver}>NEW DRIVER · VERIFIED</Text>}
              </View>
            </View>
          ) : null}

          {trip ? (
            <View style={styles.routeCard}>
              <View style={styles.routeRow}><View style={styles.routeDot} /><View style={styles.flex}><Text style={styles.routeLabel}>PICKUP</Text><Text numberOfLines={1} style={styles.routeValue}>{trip.pickup.formatted_address}</Text></View></View>
              <View style={styles.routeDivider} />
              <View style={styles.routeRow}><View style={styles.routeSquare} /><View style={styles.flex}><Text style={styles.routeLabel}>DESTINATION</Text><Text numberOfLines={1} style={styles.routeValue}>{trip.dropoff.formatted_address}</Text></View></View>
            </View>
          ) : null}

          {awaitingPin && tripPin ? (
            <View style={styles.pinCard}><Text style={styles.pinLabel}>RIDE VERIFICATION PIN</Text><Text accessibilityLabel={`Trip PIN ${tripPin}`} style={styles.pin}>{tripPin}</Text><Text style={styles.pinBody}>Tell this code only to the assigned driver.</Text></View>
          ) : null}

          {awaitingPin && !tripPin ? (
            <Pressable accessibilityRole="button" disabled={busyAction === "pin"} onPress={regeneratePin} style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}>
              <MaterialCommunityIcons name="shield-key-outline" size={19} color="#FFFFFF" /><Text style={styles.secondaryActionText}>{busyAction === "pin" ? "Generating a new PIN…" : "Generate new safety PIN"}</Text>
            </Pressable>
          ) : null}

          {trip?.status === "DRIVER_ARRIVED" && trip.verify_ride_with_pin ? (
            <Pressable accessibilityRole="button" disabled={busyAction === "boarding"} onPress={prepareSafetyPin} style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}>
              <Text style={styles.primaryActionText}>{busyAction === "boarding" ? "Preparing safety PIN…" : "Use safety PIN"}</Text><MaterialCommunityIcons name="shield-key-outline" size={19} color="#FFFFFF" />
            </Pressable>
          ) : null}

          {trip && SHAREABLE.has(trip.status) ? (
            <View style={styles.actionGrid}>
              <QuickAction icon="share-variant-outline" label={busyAction === "share" ? "Preparing link…" : "Share trip"} disabled={Boolean(busyAction)} onPress={shareTrip} />
              <QuickAction icon="message-outline" label={busyAction === "message" ? "Opening…" : "Message"} disabled={Boolean(busyAction)} onPress={messageDriver} />
            </View>
          ) : null}

          {trip?.status === "COMPLETED" ? (
            <Pressable accessibilityRole="button" onPress={() => router.replace(`/(customer)/hail/receipt/${trip.id}` as never)} style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}>
              <Text style={styles.primaryActionText}>Receipt & rate driver</Text><MaterialCommunityIcons name="arrow-right" size={19} color="#FFFFFF" />
            </Pressable>
          ) : null}

          {trip && TERMINAL.has(trip.status) && trip.status !== "COMPLETED" ? (
            <Pressable accessibilityRole="button" onPress={() => router.replace("/(customer)/hail" as never)} style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}>
              <Text style={styles.primaryActionText}>Book another ride</Text><MaterialCommunityIcons name="arrow-right" size={19} color="#FFFFFF" />
            </Pressable>
          ) : null}

          {canCancel ? (
            <Pressable accessibilityRole="button" disabled={busyAction === "cancel"} onPress={cancel} style={({ pressed }) => [styles.cancelAction, pressed && styles.pressed]}>
              <Text style={styles.cancelActionText}>{busyAction === "cancel" ? "Cancelling your ride…" : "Cancel ride"}</Text>
            </Pressable>
          ) : null}

          {trip ? <Text style={styles.fareLine}>Cash fare ${trip.fare.total_fare.toFixed(2)} · {trip.route.distance_km.toFixed(1)} km · {trip.ride_class}</Text> : null}
        </ScrollView>
      </View>

      <BottomNav role="customer" />
    </SafeAreaView>
  );
}

function QuickAction({ icon, label, disabled, onPress }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.quickAction, disabled && styles.disabled, pressed && styles.pressed]}>
      <MaterialCommunityIcons name={icon} size={19} color={RIDE_BLACK} /><Text style={styles.quickActionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#ECECE8" },
  topBar: { position: "absolute", left: 16, right: 16, zIndex: 30, elevation: 30, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  topButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.97)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(0,0,0,0.10)", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  topSpacer: { width: 48, height: 48 },
  statusPill: { minHeight: 36, maxWidth: 220, paddingHorizontal: 13, borderRadius: 18, backgroundColor: "rgba(17,17,17,0.94)", alignItems: "center", justifyContent: "center" },
  statusPillText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  sheet: { position: "absolute", left: 10, right: 10, bottom: SHEET_BOTTOM, maxHeight: "58%", minHeight: 265, backgroundColor: "rgba(255,255,255,0.985)", borderRadius: 30, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(0,0,0,0.08)", shadowColor: "#000", shadowOpacity: 0.13, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 12, overflow: "hidden" },
  handle: { width: 42, height: 4, borderRadius: 2, backgroundColor: "#D7D8D5", alignSelf: "center", marginTop: 8 },
  content: { paddingHorizontal: 15, paddingTop: 10, paddingBottom: 17, gap: 11 },
  headingRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  eyebrow: { color: RIDE_BLACK, fontSize: 9, fontWeight: "900", letterSpacing: 1.3 },
  title: { color: v2Theme.colors.ink, fontSize: 25, lineHeight: 29, fontWeight: "900", letterSpacing: -0.7, marginTop: 1 },
  body: { color: v2Theme.colors.inkSecondary, fontSize: 10.5, lineHeight: 16, marginTop: 3 },
  liveBadge: { minWidth: 50, minHeight: 34, borderRadius: 17, backgroundColor: "#F0F0EE", paddingHorizontal: 9, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: v2Theme.colors.brand },
  liveDotSyncing: { backgroundColor: "#D39A24" },
  liveText: { color: RIDE_BLACK, fontSize: 8, fontWeight: "900", letterSpacing: 0.6 },
  skeleton: { borderRadius: 18, backgroundColor: "#F6F5F2", padding: 14, gap: 9 },
  skeletonWide: { height: 13, width: "75%", borderRadius: 7, backgroundColor: "#E3E2DE" },
  skeletonShort: { height: 10, width: "48%", borderRadius: 5, backgroundColor: "#E9E8E4" },
  driverCard: { minHeight: 76, borderRadius: 20, backgroundColor: "#F7F7F5", borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, padding: 11, flexDirection: "row", alignItems: "center", gap: 11 },
  driverName: { color: v2Theme.colors.ink, fontSize: 15, fontWeight: "900" },
  vehicle: { color: v2Theme.colors.inkSecondary, fontSize: 10, marginTop: 2 },
  rating: { color: RIDE_BLACK, fontSize: 10, fontWeight: "900", marginTop: 3 },
  newDriver: { color: v2Theme.colors.inkSecondary, fontSize: 8.5, fontWeight: "900", letterSpacing: 0.55, marginTop: 3 },
  routeCard: { borderRadius: 18, backgroundColor: "#F7F7F5", borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, overflow: "hidden" },
  routeRow: { minHeight: 49, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 9 },
  routeDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: RIDE_BLACK },
  routeSquare: { width: 10, height: 10, borderRadius: 2, backgroundColor: RIDE_BLACK },
  routeDivider: { height: StyleSheet.hairlineWidth, marginLeft: 30, backgroundColor: v2Theme.colors.lineStrong },
  routeLabel: { color: v2Theme.colors.inkTertiary, fontSize: 7.5, fontWeight: "900", letterSpacing: 0.7 },
  routeValue: { color: v2Theme.colors.ink, fontSize: 10.5, fontWeight: "800", marginTop: 2 },
  pinCard: { borderRadius: 18, backgroundColor: RIDE_BLACK, padding: 15, gap: 4 },
  pinLabel: { color: "rgba(255,255,255,0.62)", fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  pin: { color: "#FFFFFF", fontSize: 29, fontWeight: "900", letterSpacing: 6 },
  pinBody: { color: "rgba(255,255,255,0.7)", fontSize: 9.5 },
  actionGrid: { flexDirection: "row", gap: 8 },
  quickAction: { flex: 1, minHeight: 47, borderRadius: 16, backgroundColor: "#F1F1EF", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  quickActionText: { color: RIDE_BLACK, fontSize: 10.5, fontWeight: "900" },
  primaryAction: { minHeight: 52, borderRadius: 18, backgroundColor: RIDE_BLACK, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  primaryActionText: { color: "#FFFFFF", fontSize: 12.5, fontWeight: "900" },
  secondaryAction: { minHeight: 50, borderRadius: 18, backgroundColor: RIDE_BLACK, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  secondaryActionText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  cancelAction: { minHeight: 46, borderRadius: 16, backgroundColor: "#F3F1EE", alignItems: "center", justifyContent: "center" },
  cancelActionText: { color: v2Theme.colors.danger, fontSize: 10.5, fontWeight: "900" },
  fareLine: { color: v2Theme.colors.inkTertiary, fontSize: 9, textAlign: "center", fontWeight: "700" },
  flex: { flex: 1 },
  disabled: { opacity: 0.48 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
});
