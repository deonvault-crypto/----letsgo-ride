import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { AppNotice } from "../../../components/ui/AppNotice";
import { Screen } from "../../../components/ui/Screen";
import { v2Theme } from "../../../constants/v2Theme";
import { useActiveHailingTrip } from "../../../hooks/useHailing";
import { cancelHailingTrip } from "../../../services/hailingService";

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

  return (
    <Screen navRole="customer" refreshing={refreshing} onRefresh={reload}>
      <View style={styles.card}>
        <View style={styles.iconRing}>
          {trip?.status === "NO_DRIVER_FOUND" ? (
            <MaterialCommunityIcons name="car-off" size={38} color={v2Theme.colors.warning} />
          ) : (
            <ActivityIndicator color={v2Theme.colors.brandStrong} size="large" />
          )}
        </View>
        <Text style={styles.title}>{trip?.status === "NO_DRIVER_FOUND" ? "No drivers nearby right now" : "Finding an approved driver"}</Text>
        <Text style={styles.body}>
          {trip?.status === "NO_DRIVER_FOUND"
            ? "You can try again, change the ride class or use intercity rides."
            : "Keep this screen open or come back later. Your trip is restored from the server if the app restarts."}
        </Text>
        {trip ? <Text style={styles.meta}>Cash fare ${trip.fare.total_fare.toFixed(2)} · {trip.ride_class}</Text> : null}
      </View>

      {error ? <AppNotice message={error} actionLabel="Retry" onAction={reload} /> : null}

      <View style={styles.actions}>
        {trip?.status === "NO_DRIVER_FOUND" ? (
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
  card: { minHeight: 360, borderRadius: 32, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, padding: 24, alignItems: "center", justifyContent: "center", gap: 13 },
  iconRing: { width: 88, height: 88, borderRadius: 44, backgroundColor: v2Theme.colors.brandSofter, alignItems: "center", justifyContent: "center" },
  title: { color: v2Theme.colors.ink, fontSize: 27, lineHeight: 32, textAlign: "center", fontWeight: "900", letterSpacing: -0.8 },
  body: { color: v2Theme.colors.inkSecondary, fontSize: 14, lineHeight: 21, textAlign: "center" },
  meta: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900" },
  actions: { gap: 10 },
  primary: { minHeight: 54, borderRadius: 18, backgroundColor: v2Theme.colors.brand, alignItems: "center", justifyContent: "center" },
  primaryText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  danger: { minHeight: 54, borderRadius: 18, backgroundColor: v2Theme.colors.dangerSoft, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(200,69,69,0.35)", alignItems: "center", justifyContent: "center" },
  dangerText: { color: v2Theme.colors.danger, fontSize: 13, fontWeight: "900" },
  pressed: { opacity: 0.72 },
});
