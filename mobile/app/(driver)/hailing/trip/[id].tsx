import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { AppNotice } from "../../../../components/ui/AppNotice";
import { Screen } from "../../../../components/ui/Screen";
import { v2Theme } from "../../../../constants/v2Theme";
import {
  cancelHailingTrip,
  completeHailingTrip,
  getHailingTrip,
  markHailingDriverArrived,
  openHailingConversation,
  startHailingTrip,
  verifyHailingTripPin,
} from "../../../../services/hailingService";
import { HailingTrip } from "../../../../types/hailing.types";

const terminal = new Set(["COMPLETED", "CANCELLED_BY_PASSENGER", "CANCELLED_BY_DRIVER", "CANCELLED_BY_ADMIN", "NO_DRIVER_FOUND"]);

export default function DriverHailingTripScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const tripId = String(params.id || "");
  const [trip, setTrip] = useState<HailingTrip | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTrip(await getHailingTrip(tripId));
      setNotice(null);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Unable to refresh this trip.");
    }
  }, [tripId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!trip || terminal.has(trip.status)) return undefined;
    const timer = setTimeout(load, 4500);
    return () => clearTimeout(timer);
  }, [load, trip?.id, trip?.status]);

  async function mutate(action: () => Promise<HailingTrip>, fallback: string) {
    try {
      setBusy(true);
      setTrip(await action());
      setNotice(null);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  async function messagePassenger() {
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

  return (
    <Screen navRole="driver" onRefresh={load}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>RIDE NOW TRIP</Text>
        <Text style={styles.title}>{trip?.status.replaceAll("_", " ") || "Trip"}</Text>
        {trip ? <Text style={styles.body}>{trip.pickup.formatted_address} → {trip.dropoff.formatted_address}</Text> : null}
      </View>

      {notice ? <AppNotice message={notice} actionLabel="Refresh" onAction={load} /> : null}

      {trip ? (
        <>
          <View style={styles.card}>
            <Text style={styles.label}>Passenger</Text>
            <Text style={styles.value}>{trip.passenger?.name || "Passenger"}</Text>
            <Text style={styles.body}>Cash fare ${trip.fare.total_fare.toFixed(2)} · {trip.route.distance_km.toFixed(1)} km</Text>
          </View>

          {trip.status === "DRIVER_ASSIGNED" || trip.status === "DRIVER_EN_ROUTE" ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Mark arrived at pickup" disabled={busy} onPress={() => mutate(() => markHailingDriverArrived(trip.id), "Unable to mark arrival.")} style={({ pressed }) => [styles.primary, busy && styles.disabled, pressed && styles.pressed]}>
              <Text style={styles.primaryText}>I’ve arrived</Text>
            </Pressable>
          ) : null}

          {trip.status === "PASSENGER_CONFIRMED_BOARDING" ? (
            <View style={styles.pinCard}>
              <Text style={styles.label}>Passenger confirmed</Text>
              <Text style={styles.body}>The passenger says they are in the car.</Text>
              {trip.verify_ride_with_pin && !trip.trip_pin_verified_at ? (
                <>
                  <TextInput
                    accessibilityLabel="Enter passenger trip PIN"
                    keyboardType="number-pad"
                    value={pin}
                    onChangeText={setPin}
                    maxLength={6}
                    placeholder="Enter PIN"
                    style={styles.input}
                  />
                  <Pressable accessibilityRole="button" accessibilityLabel="Verify trip PIN" disabled={busy || pin.length < 4} onPress={() => mutate(() => verifyHailingTripPin(trip.id, pin), "PIN could not be verified.")} style={({ pressed }) => [styles.secondary, (busy || pin.length < 4) && styles.disabled, pressed && styles.pressed]}>
                    <Text style={styles.secondaryText}>Verify PIN</Text>
                  </Pressable>
                </>
              ) : null}
              {!trip.verify_ride_with_pin || trip.trip_pin_verified_at ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Start hailing trip" disabled={busy} onPress={() => mutate(() => startHailingTrip(trip.id), "Unable to start this trip.")} style={({ pressed }) => [styles.secondary, busy && styles.disabled, pressed && styles.pressed]}>
                  <Text style={styles.secondaryText}>Start trip</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {trip.status === "IN_PROGRESS" ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Complete hailing trip" disabled={busy} onPress={() => mutate(() => completeHailingTrip(trip.id), "Unable to complete this trip.")} style={({ pressed }) => [styles.primary, busy && styles.disabled, pressed && styles.pressed]}>
              <Text style={styles.primaryText}>Complete trip</Text>
            </Pressable>
          ) : null}

          {["DRIVER_ASSIGNED", "DRIVER_EN_ROUTE", "DRIVER_ARRIVED", "PASSENGER_CONFIRMED_BOARDING"].includes(trip.status) ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel hailing trip" disabled={busy} onPress={() => mutate(() => cancelHailingTrip(trip.id, "Driver cancelled"), "Unable to cancel this trip.")} style={({ pressed }) => [styles.danger, busy && styles.disabled, pressed && styles.pressed]}>
              <Text style={styles.dangerText}>Cancel trip</Text>
            </Pressable>
          ) : null}
          {["DRIVER_ASSIGNED", "DRIVER_EN_ROUTE", "DRIVER_ARRIVED", "PASSENGER_CONFIRMED_BOARDING", "IN_PROGRESS"].includes(trip.status) ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Message passenger" disabled={busy} onPress={messagePassenger} style={({ pressed }) => [styles.secondary, busy && styles.disabled, pressed && styles.pressed]}>
              <Text style={styles.secondaryText}>Message passenger</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 8 },
  eyebrow: { color: v2Theme.colors.brandStrong, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: v2Theme.colors.ink, fontSize: 31, lineHeight: 36, fontWeight: "900", letterSpacing: -1 },
  body: { color: v2Theme.colors.inkSecondary, fontSize: 13, lineHeight: 19 },
  card: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, padding: 16, gap: 4 },
  label: { color: v2Theme.colors.inkTertiary, fontSize: 10, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase" },
  value: { color: v2Theme.colors.ink, fontSize: 18, fontWeight: "900" },
  pinCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, padding: 16, gap: 10 },
  input: { minHeight: 54, borderRadius: 18, backgroundColor: v2Theme.colors.surfaceMuted, paddingHorizontal: 16, color: v2Theme.colors.ink, fontSize: 22, fontWeight: "900", letterSpacing: 5 },
  primary: { minHeight: 54, borderRadius: 18, backgroundColor: v2Theme.colors.brand, alignItems: "center", justifyContent: "center" },
  primaryText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  secondary: { minHeight: 54, borderRadius: 18, backgroundColor: v2Theme.colors.ink, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  danger: { minHeight: 54, borderRadius: 18, backgroundColor: v2Theme.colors.dangerSoft, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(200,69,69,0.35)", alignItems: "center", justifyContent: "center" },
  dangerText: { color: v2Theme.colors.danger, fontSize: 13, fontWeight: "900" },
  disabled: { opacity: 0.48 },
  pressed: { opacity: 0.72 },
});
