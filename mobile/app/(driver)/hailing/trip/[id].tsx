import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Linking, Platform, Pressable, StatusBar, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { HailingMapBackdrop } from "../../../../components/hailing/HailingMapBackdrop";
import { AppNotice } from "../../../../components/ui/AppNotice";
import { v2Theme } from "../../../../constants/v2Theme";
import { useHailingTripRealtime } from "../../../../hooks/useHailing";
import {
  cancelHailingTrip,
  completeHailingTrip,
  markHailingDriverArrived,
  openHailingConversation,
  startHailingTrip,
  verifyHailingTripPin,
} from "../../../../services/hailingService";
import { HailingTrip, HailingTripStatus } from "../../../../types/hailing.types";

const RIDE_BLACK = "#111111";
const TERMINAL = new Set<HailingTripStatus>([
  "COMPLETED",
  "CANCELLED_BY_PASSENGER",
  "CANCELLED_BY_DRIVER",
  "CANCELLED_BY_ADMIN",
  "NO_DRIVER_FOUND",
]);

function statusTitle(status?: HailingTripStatus) {
  switch (status) {
    case "DRIVER_ASSIGNED":
    case "DRIVER_EN_ROUTE": return "Head to pickup";
    case "DRIVER_ARRIVED": return "Passenger pickup";
    case "IN_PROGRESS": return "Drive to destination";
    case "COMPLETED": return "Trip completed";
    case "CANCELLED_BY_PASSENGER": return "Passenger cancelled";
    case "CANCELLED_BY_DRIVER": return "Trip cancelled";
    case "CANCELLED_BY_ADMIN": return "Trip closed";
    case "NO_DRIVER_FOUND": return "Trip closed";
    default: return "Ride Now";
  }
}

function statusHint(status?: HailingTripStatus) {
  switch (status) {
    case "DRIVER_ASSIGNED":
    case "DRIVER_EN_ROUTE": return "Follow the map to the pickup point.";
    case "DRIVER_ARRIVED": return "Start when the passenger is safely in the vehicle.";
    case "IN_PROGRESS": return "Follow the route to the destination.";
    case "COMPLETED": return "Fare recorded. You’re ready for the next ride.";
    default: return "Trip status updates live.";
  }
}

export default function DriverHailingTripScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const tripId = String(params.id || "");
  const { trip, loading, error, reload, setTrip, realtimeState } = useHailingTripRealtime(tripId, Boolean(tripId));
  const [pin, setPin] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function mutate(name: string, action: () => Promise<HailingTrip>, fallback: string) {
    try {
      setBusyAction(name);
      setNotice(null);
      setTrip(await action());
    } catch (err) {
      setNotice(err instanceof Error ? err.message : fallback);
    } finally {
      setBusyAction(null);
    }
  }

  async function messagePassenger() {
    if (!trip) return;
    try {
      setBusyAction("message");
      const conversation = await openHailingConversation(trip.id);
      router.push(`/(shared)/conversation/${conversation.id}` as never);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Unable to open this trip conversation.");
    } finally {
      setBusyAction(null);
    }
  }

  async function navigate() {
    if (!trip) return;
    const target = trip.status === "IN_PROGRESS" ? trip.dropoff : trip.pickup;
    const label = encodeURIComponent(target.formatted_address || "LetsGoRide destination");
    const url = Platform.OS === "ios"
      ? `http://maps.apple.com/?daddr=${target.latitude},${target.longitude}&q=${label}&dirflg=d`
      : `google.navigation:q=${target.latitude},${target.longitude}`;
    try {
      await Linking.openURL(url);
    } catch {
      setNotice("Navigation could not be opened on this device.");
    }
  }

  const canCancel = Boolean(trip && ["DRIVER_ASSIGNED", "DRIVER_EN_ROUTE", "DRIVER_ARRIVED"].includes(trip.status));
  const destination = trip?.status === "IN_PROGRESS" ? trip.dropoff : trip?.pickup;
  const needsPin = Boolean(trip?.status === "DRIVER_ARRIVED" && trip.verify_ride_with_pin && !trip.trip_pin_verified_at);
  const live = realtimeState === "connected";

  return (
    <SafeAreaView edges={[]} style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <HailingMapBackdrop
        pickup={trip?.pickup}
        dropoff={trip?.dropoff}
        route={trip?.route}
        driverLocation={trip?.driver_location}
        bottomPadding={390}
      />

      <View pointerEvents="box-none" style={[styles.topBar, { top: insets.top + 8 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to Driver home" hitSlop={8} onPress={() => router.replace("/(driver)/home" as never)} style={({ pressed }) => [styles.topButton, pressed && styles.pressed]}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={RIDE_BLACK} />
        </Pressable>
        <View style={styles.livePill}>
          <View style={[styles.liveDot, !live && styles.liveDotRecovering]} />
          <Text style={styles.liveText}>{live ? "LIVE" : "SYNCING"}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Message passenger" hitSlop={8} disabled={!trip || Boolean(busyAction)} onPress={() => void messagePassenger()} style={({ pressed }) => [styles.topButton, pressed && styles.pressed]}>
          <MaterialCommunityIcons name="message-outline" size={21} color={RIDE_BLACK} />
        </Pressable>
      </View>

      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.handle} />
        <View style={styles.headingRow}>
          <View style={styles.flex}>
            <Text style={styles.eyebrow}>RIDE NOW DRIVER</Text>
            <Text style={styles.title}>{loading && !trip ? "Opening live trip…" : statusTitle(trip?.status)}</Text>
            <Text style={styles.body}>{statusHint(trip?.status)}</Text>
          </View>
          {trip && !TERMINAL.has(trip.status) ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Open navigation" onPress={() => void navigate()} style={({ pressed }) => [styles.navigateButton, pressed && styles.pressed]}>
              <MaterialCommunityIcons name="navigation-variant-outline" size={21} color="#FFFFFF" />
            </Pressable>
          ) : null}
        </View>

        {notice || error ? <AppNotice message={notice || error || ""} actionLabel="Reconnect" onAction={() => void reload()} onDismiss={() => setNotice(null)} /> : null}

        {trip ? (
          <>
            <View style={styles.passengerRow}>
              <View style={styles.passengerAvatar}><Text style={styles.passengerInitial}>{(trip.passenger?.name || "P").slice(0, 1).toUpperCase()}</Text></View>
              <View style={styles.flex}>
                <Text style={styles.passengerName}>{trip.passenger?.name || "Passenger"}</Text>
                <Text numberOfLines={1} style={styles.destination}>{destination?.formatted_address}</Text>
              </View>
              <View style={styles.fareChip}><Text style={styles.fareText}>${trip.fare.total_fare.toFixed(2)}</Text></View>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.meta}>{trip.route.distance_km.toFixed(1)} km</Text>
              <Text style={styles.metaDot}>•</Text>
              <Text style={styles.meta}>{trip.ride_class}</Text>
              <Text style={styles.metaDot}>•</Text>
              <Text style={styles.meta}>Cash</Text>
            </View>

            {(trip.status === "DRIVER_ASSIGNED" || trip.status === "DRIVER_EN_ROUTE") ? (
              <Pressable accessibilityRole="button" disabled={Boolean(busyAction)} onPress={() => void mutate("arrived", () => markHailingDriverArrived(trip.id), "Unable to mark arrival.")} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
                <Text style={styles.primaryText}>{busyAction === "arrived" ? "Marking arrival…" : "I’ve arrived"}</Text>
                <MaterialCommunityIcons name="map-marker-check-outline" size={20} color="#FFFFFF" />
              </Pressable>
            ) : null}

            {needsPin ? (
              <View style={styles.pinRow}>
                <TextInput
                  accessibilityLabel="Enter passenger safety PIN"
                  keyboardType="number-pad"
                  value={pin}
                  onChangeText={setPin}
                  maxLength={6}
                  placeholder="Safety PIN"
                  placeholderTextColor={v2Theme.colors.inkTertiary}
                  style={styles.pinInput}
                />
                <Pressable accessibilityRole="button" disabled={Boolean(busyAction) || pin.length < 4} onPress={() => void mutate("pin", () => verifyHailingTripPin(trip.id, pin), "PIN could not be verified.")} style={({ pressed }) => [styles.pinButton, (Boolean(busyAction) || pin.length < 4) && styles.disabled, pressed && styles.pressed]}>
                  <Text style={styles.pinButtonText}>{busyAction === "pin" ? "Checking…" : "Verify"}</Text>
                </Pressable>
              </View>
            ) : null}

            {trip.status === "DRIVER_ARRIVED" && !needsPin ? (
              <Pressable accessibilityRole="button" disabled={Boolean(busyAction)} onPress={() => void mutate("start", () => startHailingTrip(trip.id), "Unable to start this trip.")} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
                <Text style={styles.primaryText}>{busyAction === "start" ? "Starting trip…" : "Start trip"}</Text>
                <MaterialCommunityIcons name="arrow-right" size={20} color="#FFFFFF" />
              </Pressable>
            ) : null}

            {trip.status === "IN_PROGRESS" ? (
              <Pressable accessibilityRole="button" disabled={Boolean(busyAction)} onPress={() => void mutate("complete", () => completeHailingTrip(trip.id), "Unable to complete this trip.")} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
                <Text style={styles.primaryText}>{busyAction === "complete" ? "Completing trip…" : "Complete trip"}</Text>
                <MaterialCommunityIcons name="flag-checkered" size={20} color="#FFFFFF" />
              </Pressable>
            ) : null}

            {trip.status === "COMPLETED" ? (
              <Pressable accessibilityRole="button" onPress={() => router.replace("/(driver)/home" as never)} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
                <Text style={styles.primaryText}>Back to Driver home</Text>
                <MaterialCommunityIcons name="arrow-right" size={20} color="#FFFFFF" />
              </Pressable>
            ) : null}

            {canCancel ? (
              <Pressable accessibilityRole="button" disabled={Boolean(busyAction)} onPress={() => void mutate("cancel", () => cancelHailingTrip(trip.id, "Driver cancelled"), "Unable to cancel this trip.")} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}>
                <Text style={styles.cancelText}>{busyAction === "cancel" ? "Cancelling…" : "Cancel ride"}</Text>
              </Pressable>
            ) : null}
          </>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F6F2E9" },
  topBar: { position: "absolute", left: 16, right: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  topButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.96)", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  livePill: { minHeight: 38, paddingHorizontal: 13, borderRadius: 19, flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "rgba(255,255,255,0.96)", shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: v2Theme.colors.brand },
  liveDotRecovering: { backgroundColor: "#D39A24" },
  liveText: { color: RIDE_BLACK, fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  sheet: { position: "absolute", left: 14, right: 14, bottom: 14, borderRadius: 30, backgroundColor: "rgba(255,255,255,0.98)", paddingHorizontal: 18, paddingTop: 10, gap: 13, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 7 }, elevation: 10 },
  handle: { width: 42, height: 4, borderRadius: 2, backgroundColor: "#D7D4CE", alignSelf: "center", marginBottom: 2 },
  headingRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  eyebrow: { color: v2Theme.colors.brandStrong, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: RIDE_BLACK, fontSize: 25, lineHeight: 29, fontWeight: "900", letterSpacing: -0.7, marginTop: 2 },
  body: { color: v2Theme.colors.inkSecondary, fontSize: 12, lineHeight: 17, marginTop: 3 },
  navigateButton: { width: 48, height: 48, borderRadius: 17, backgroundColor: RIDE_BLACK, alignItems: "center", justifyContent: "center" },
  passengerRow: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 11 },
  passengerAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: v2Theme.colors.brandSofter, alignItems: "center", justifyContent: "center" },
  passengerInitial: { color: v2Theme.colors.brandStrong, fontSize: 16, fontWeight: "900" },
  passengerName: { color: RIDE_BLACK, fontSize: 16, fontWeight: "900" },
  destination: { color: v2Theme.colors.inkSecondary, fontSize: 11, marginTop: 3 },
  fareChip: { minHeight: 36, minWidth: 66, paddingHorizontal: 10, borderRadius: 18, backgroundColor: "#F0F7F2", alignItems: "center", justifyContent: "center" },
  fareText: { color: v2Theme.colors.brandStrong, fontSize: 14, fontWeight: "900" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  meta: { color: v2Theme.colors.inkSecondary, fontSize: 10, fontWeight: "800" },
  metaDot: { color: v2Theme.colors.inkTertiary, fontSize: 9 },
  primary: { minHeight: 56, borderRadius: 18, backgroundColor: RIDE_BLACK, flexDirection: "row", gap: 9, alignItems: "center", justifyContent: "center" },
  primaryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  pinRow: { flexDirection: "row", gap: 9 },
  pinInput: { flex: 1, minHeight: 54, borderRadius: 17, backgroundColor: v2Theme.colors.surfaceMuted, paddingHorizontal: 15, color: RIDE_BLACK, fontSize: 18, fontWeight: "900", letterSpacing: 3 },
  pinButton: { minWidth: 96, minHeight: 54, borderRadius: 17, backgroundColor: RIDE_BLACK, alignItems: "center", justifyContent: "center" },
  pinButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  cancel: { minHeight: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  cancelText: { color: v2Theme.colors.danger, fontSize: 11, fontWeight: "900" },
  flex: { flex: 1 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.72 },
});
