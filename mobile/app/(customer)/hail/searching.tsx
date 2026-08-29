import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { AppNotice } from "../../../components/ui/AppNotice";
import { Screen } from "../../../components/ui/Screen";
import { v2Theme } from "../../../constants/v2Theme";
import { useActiveHailingTrip } from "../../../hooks/useHailing";
import { cancelHailingTrip } from "../../../services/hailingService";
import { ridePalette } from "../../../components/platform/ridePalette";

export default function HailingSearchingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tripId?: string }>();
  const { trip, loading, refreshing, error, reload, setTrip } = useActiveHailingTrip(true);

  async function cancel() {
    const id = trip?.id || params.tripId;
    if (!id) return router.replace("/(customer)/hail" as never);
    try {
      const next = await cancelHailingTrip(id, "Passenger cancelled while searching");
      setTrip(next);
      router.replace("/(customer)/hail" as never);
    } catch {
      reload();
    }
  }

  if (!loading && trip && trip.status !== "SEARCHING" && trip.status !== "NO_DRIVER_FOUND") {
    router.replace(`/(customer)/hail/trip/${trip.id}` as never);
  }

  const noDriver = trip?.status === "NO_DRIVER_FOUND";

  return (
    <Screen navRole="customer" refreshing={refreshing} onRefresh={reload}>
      <View style={styles.card}>
        <View style={[styles.iconRing, noDriver && styles.iconRingWarning]}>
          {noDriver ? (
            <MaterialCommunityIcons name="car-off" size={34} color={v2Theme.colors.warning} />
          ) : (
            <ActivityIndicator color={ridePalette.primary} size="large" />
          )}
        </View>
        <Text style={styles.title}>{noDriver ? "No drivers nearby right now" : "Finding your driver"}</Text>
        <Text style={styles.body}>
          {noDriver
            ? "Try again in a moment, change the ride class or use an intercity ride."
            : "We’re checking approved nearby drivers. You can leave this screen — your request stays active."}
        </Text>
        {trip ? (
          <View style={styles.metaPill}>
            <Text style={styles.meta}>Cash ${trip.fare.total_fare.toFixed(2)} · {trip.ride_class}</Text>
          </View>
        ) : null}
      </View>

      {error ? <AppNotice message={error} actionLabel="Retry" onAction={reload} /> : null}

      <View style={styles.actions}>
        {noDriver ? (
          <Pressable accessibilityRole="button" onPress={() => router.replace("/(customer)/hail" as never)} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
            <Text style={styles.primaryText}>Try again</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel Ride Now request" onPress={cancel} style={({ pressed }) => [styles.danger, pressed && styles.pressed]}>
            <Text style={styles.dangerText}>Cancel request</Text>
          </Pressable>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: 300, borderRadius: 28, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, padding: 22, alignItems: "center", justifyContent: "center", gap: 12 },
  iconRing: { width: 78, height: 78, borderRadius: 39, backgroundColor: ridePalette.soft, alignItems: "center", justifyContent: "center" },
  iconRingWarning: { backgroundColor: v2Theme.colors.warningSoft },
  title: { color: v2Theme.colors.ink, fontSize: 25, lineHeight: 30, textAlign: "center", fontWeight: "900", letterSpacing: -0.7 },
  body: { maxWidth: 300, color: v2Theme.colors.inkSecondary, fontSize: 13, lineHeight: 20, textAlign: "center" },
  metaPill: { minHeight: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: ridePalette.soft, alignItems: "center", justifyContent: "center" },
  meta: { color: ridePalette.primary, fontSize: 11, fontWeight: "900" },
  actions: { gap: 10 },
  primary: { minHeight: 54, borderRadius: 18, backgroundColor: ridePalette.primary, alignItems: "center", justifyContent: "center" },
  primaryText: { color: ridePalette.white, fontSize: 13, fontWeight: "900" },
  danger: { minHeight: 54, borderRadius: 18, backgroundColor: v2Theme.colors.dangerSoft, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(200,69,69,0.35)", alignItems: "center", justifyContent: "center" },
  dangerText: { color: v2Theme.colors.danger, fontSize: 13, fontWeight: "900" },
  pressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
});
