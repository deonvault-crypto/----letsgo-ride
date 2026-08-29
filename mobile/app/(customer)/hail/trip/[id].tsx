import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppNotice } from "../../../../components/ui/AppNotice";
import { Avatar } from "../../../../components/ui/Avatar";
import { Screen } from "../../../../components/ui/Screen";
import { v2Theme } from "../../../../constants/v2Theme";
import {
  cancelHailingTrip,
  confirmHailingBoarding,
  getHailingTrip,
  openHailingConversation,
  regenerateHailingTripPin,
  sendHailingSafetyEvent,
} from "../../../../services/hailingService";
import { HailingTrip } from "../../../../types/hailing.types";

const terminal = new Set(["COMPLETED", "CANCELLED_BY_PASSENGER", "CANCELLED_BY_DRIVER", "CANCELLED_BY_ADMIN", "NO_DRIVER_FOUND"]);

export default function CustomerHailingTripScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const tripId = String(params.id || "");
  const [trip, setTrip] = useState<HailingTrip | null>(null);
  const [tripPin, setTripPin] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tripId) return;
    try {
      setRefreshing(true);
      const next = await getHailingTrip(tripId);
      setTrip(next);
      if (!next.verify_ride_with_pin || next.trip_pin_verified_at || terminal.has(next.status) || next.status === "IN_PROGRESS") {
        setTripPin(null);
      }
      setNotice(null);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Unable to refresh this trip.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tripId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!trip || terminal.has(trip.status)) return undefined;
    const timer = setTimeout(load, 4500);
    return () => clearTimeout(timer);
  }, [load, trip?.id, trip?.status]);

  async function cancel() {
    if (!trip) return;
    try {
      setBusy(true);
      const next = await cancelHailingTrip(trip.id, "Passenger cancelled");
      setTrip(next);
      setTripPin(null);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Unable to cancel this trip.");
    } finally {
      setBusy(false);
    }
  }

  async function safety() {
    if (!trip) return;
    try {
      setBusy(true);
      await sendHailingSafetyEvent(trip.id, { kind: "help_requested", message: "Passenger requested help from the hailing trip screen." });
      setNotice("Support has been notified. If you are in immediate danger, call emergency services.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Unable to send this safety request.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmBoarding() {
    if (!trip) return;
    try {
      setBusy(true);
      const next = await confirmHailingBoarding(trip.id);
      setTrip(next);
      if (next.trip_pin) setTripPin(next.trip_pin);
      setNotice(next.verify_ride_with_pin ? "Use this one-time PIN to verify the ride with your driver." : "Ready to go. Waiting for your driver to start the trip.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Unable to confirm boarding.");
    } finally {
      setBusy(false);
    }
  }

  async function regeneratePin() {
    if (!trip) return;
    try {
      setBusy(true);
      const next = await regenerateHailingTripPin(trip.id);
      setTrip(next);
      if (!next.trip_pin) throw new Error("A new PIN could not be generated. Please try again.");
      setTripPin(next.trip_pin);
      setNotice("A new one-time PIN was generated. Your previous PIN no longer works.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Unable to generate a new PIN.");
    } finally {
      setBusy(false);
    }
  }

  async function messageDriver() {
    if (!trip) return;
    try {
      setBusy(true);
      const conversation = await openHailingConversation(trip.id);
      router.push(`/(shared)/conversation/${conversation.id}` as never);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Unable to open this trip conversation.");
    } finally {
      setBusy(false);
    }
  }

  const awaitingOptionalPin = Boolean(
    trip?.status === "PASSENGER_CONFIRMED_BOARDING"
      && trip.verify_ride_with_pin
      && !trip.trip_pin_verified_at,
  );
  const vehicleName = [trip?.vehicle?.make, trip?.vehicle?.model].filter(Boolean).join(" ");
  const vehicleMeta = [trip?.vehicle?.color, trip?.vehicle?.plate_number || trip?.vehicle?.plate].filter(Boolean).join(" · ");
  const vehicleDescription = [vehicleName || trip?.vehicle?.vehicle, vehicleMeta].filter(Boolean).join(" · ") || "Vehicle details appear after matching";
  const tripDurationMinutes = trip
    ? trip.route.duration_minutes
      ?? trip.route.estimated_duration_minutes
      ?? (trip.route.duration_seconds ? trip.route.duration_seconds / 60 : undefined)
    : undefined;

  return (
    <Screen navRole="customer" refreshing={refreshing} onRefresh={load}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>RIDE NOW</Text>
        <Text style={styles.title}>{loading ? "Loading trip" : trip?.status.replaceAll("_", " ") || "Trip unavailable"}</Text>
        {trip ? <Text style={styles.body}>{trip.pickup.formatted_address} → {trip.dropoff.formatted_address}</Text> : null}
      </View>

      {notice ? <AppNotice message={notice} actionLabel="Refresh" onAction={load} /> : null}

      {trip ? (
        <>
          <View style={styles.driverCard}>
            <Avatar name={trip.driver?.name || "Driver"} imageUri={trip.driver?.profile_photo_url} size={54} />
            <View style={styles.flex}>
              <Text style={styles.cardLabel}>Driver</Text>
              <Text style={styles.cardTitle}>{trip.driver?.name || "Driver being assigned"}</Text>
              <Text style={styles.cardBody}>{vehicleDescription}</Text>
              {trip.driver?.rating ? <Text style={styles.driverRating}>★ {trip.driver.rating.toFixed(1)}</Text> : null}
            </View>
          </View>

          {awaitingOptionalPin && tripPin ? (
            <View style={styles.pinCard}>
              <Text style={styles.pinLabel}>Ride verification PIN</Text>
              <Text accessibilityLabel={`Trip PIN ${tripPin}`} style={styles.pin}>{tripPin}</Text>
              <Text style={styles.pinBody}>Tell this PIN only to your assigned driver. It is not stored as readable text on the server.</Text>
            </View>
          ) : null}

          {awaitingOptionalPin && !tripPin ? (
            <View style={styles.readyCard}>
              <Text style={styles.cardLabel}>Verification PIN needed</Text>
              <Text style={styles.cardBody}>For security, the PIN is shown only when it is generated. If you reopened the app, generate a new PIN and the old one will stop working.</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Generate new ride verification PIN" disabled={busy} onPress={regeneratePin} style={({ pressed }) => [styles.secondary, busy && styles.disabled, pressed && styles.pressed]}>
                <Text style={styles.secondaryText}>Generate new PIN</Text>
              </Pressable>
            </View>
          ) : null}

          {trip.status === "DRIVER_ARRIVED" ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Confirm I am in the car" disabled={busy} onPress={confirmBoarding} style={({ pressed }) => [styles.primary, busy && styles.disabled, pressed && styles.pressed]}>
              <Text style={styles.primaryText}>I’m in the car</Text>
            </Pressable>
          ) : null}

          {trip.status === "PASSENGER_CONFIRMED_BOARDING" && (!trip.verify_ride_with_pin || trip.trip_pin_verified_at) ? (
            <View style={styles.readyCard}>
              <Text style={styles.cardLabel}>Ready to go</Text>
              <Text style={styles.cardBody}>Waiting for your driver to start the trip.</Text>
            </View>
          ) : null}

          <View style={styles.fareCard}>
            <Text style={styles.cardLabel}>Cash fare</Text>
            <Text style={styles.price}>${trip.fare.total_fare.toFixed(2)}</Text>
            <Text style={styles.cardBody}>
              {trip.route.distance_km.toFixed(1)} km
              {tripDurationMinutes ? ` · about ${Math.round(tripDurationMinutes)} min` : ""}
              {` · ${trip.ride_class}`}
            </Text>
          </View>

          <View style={styles.actions}>
            {trip.status === "COMPLETED" ? (
              <Pressable accessibilityRole="button" onPress={() => router.replace(`/(customer)/hail/receipt/${trip.id}` as never)} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
                <Text style={styles.primaryText}>View receipt</Text>
              </Pressable>
            ) : null}
            {!terminal.has(trip.status) ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Request trip safety help" disabled={busy} onPress={safety} style={({ pressed }) => [styles.secondary, busy && styles.disabled, pressed && styles.pressed]}>
                <Text style={styles.secondaryText}>Get help</Text>
              </Pressable>
            ) : null}
            {trip.driver && ["DRIVER_ASSIGNED", "DRIVER_EN_ROUTE", "DRIVER_ARRIVED", "PASSENGER_CONFIRMED_BOARDING", "IN_PROGRESS"].includes(trip.status) ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Message assigned driver" disabled={busy} onPress={messageDriver} style={({ pressed }) => [styles.secondary, busy && styles.disabled, pressed && styles.pressed]}>
                <Text style={styles.secondaryText}>Message driver</Text>
              </Pressable>
            ) : null}
            {["SEARCHING", "DRIVER_ASSIGNED", "DRIVER_EN_ROUTE", "DRIVER_ARRIVED", "PASSENGER_CONFIRMED_BOARDING"].includes(trip.status) ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Cancel Ride Now trip" disabled={busy} onPress={cancel} style={({ pressed }) => [styles.danger, busy && styles.disabled, pressed && styles.pressed]}>
                <Text style={styles.dangerText}>Cancel trip</Text>
              </Pressable>
            ) : null}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 8 },
  eyebrow: { color: v2Theme.colors.brandStrong, fontSize: 11, fontWeight: "900", letterSpacing: 1.4 },
  title: { color: v2Theme.colors.ink, fontSize: 31, lineHeight: 36, fontWeight: "900", letterSpacing: -1 },
  body: { color: v2Theme.colors.inkSecondary, fontSize: 13, lineHeight: 19 },
  driverCard: { minHeight: 100, borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, padding: 15, flexDirection: "row", alignItems: "center", gap: 13 },
  driverRating: { color: v2Theme.colors.brandStrong, fontSize: 11, fontWeight: "900", marginTop: 3 },
  pinCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.ink, padding: 18, gap: 6 },
  pinLabel: { color: "rgba(255,255,255,0.65)", fontSize: 10, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase" },
  pinBody: { color: "rgba(255,255,255,0.72)", fontSize: 12, lineHeight: 18 },
  fareCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.brandSofter, padding: 18, gap: 5 },
  readyCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, padding: 16, gap: 10 },
  cardLabel: { color: v2Theme.colors.inkTertiary, fontSize: 10, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase" },
  cardTitle: { color: v2Theme.colors.ink, fontSize: 17, fontWeight: "900" },
  cardBody: { color: v2Theme.colors.inkSecondary, fontSize: 12, lineHeight: 18 },
  pin: { color: "#FFFFFF", fontSize: 42, fontWeight: "900", letterSpacing: 8 },
  price: { color: v2Theme.colors.ink, fontSize: 31, fontWeight: "900", letterSpacing: -1 },
  actions: { gap: 10 },
  primary: { minHeight: 54, borderRadius: 18, backgroundColor: v2Theme.colors.brand, alignItems: "center", justifyContent: "center" },
  primaryText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  secondary: { minHeight: 54, borderRadius: 18, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: v2Theme.colors.ink, fontSize: 13, fontWeight: "900" },
  danger: { minHeight: 54, borderRadius: 18, backgroundColor: v2Theme.colors.dangerSoft, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(200,69,69,0.35)", alignItems: "center", justifyContent: "center" },
  dangerText: { color: v2Theme.colors.danger, fontSize: 13, fontWeight: "900" },
  flex: { flex: 1 },
  disabled: { opacity: 0.48 },
  pressed: { opacity: 0.72 },
});
