import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppNotice } from "../../../../components/ui/AppNotice";
import { Screen } from "../../../../components/ui/Screen";
import { v2Theme } from "../../../../constants/v2Theme";
import { getHailingTrip } from "../../../../services/hailingService";
import { HailingTrip } from "../../../../types/hailing.types";

export default function HailingReceiptScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const tripId = String(params.id || "");
  const [trip, setTrip] = useState<HailingTrip | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTrip(await getHailingTrip(tripId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load this receipt.");
    }
  }, [tripId]);

  useEffect(() => { load(); }, [load]);

  return (
    <Screen navRole="customer" onRefresh={load}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>RECEIPT</Text>
        <Text style={styles.title}>Ride complete</Text>
        <Text style={styles.body}>Cash trips keep the server-calculated fare and trip record for your history.</Text>
      </View>
      {error ? <AppNotice message={error} actionLabel="Retry" onAction={load} /> : null}
      {trip ? (
        <View style={styles.card}>
          <Line label="Pickup" value={trip.pickup.formatted_address} />
          <Line label="Drop-off" value={trip.dropoff.formatted_address} />
          <Line label="Ride class" value={trip.ride_class} />
          <Line label="Payment" value={trip.payment_status.replaceAll("_", " ")} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.total}>${trip.fare.total_fare.toFixed(2)}</Text>
          </View>
        </View>
      ) : null}
      <Pressable accessibilityRole="button" onPress={() => router.replace("/(customer)/home" as never)} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
        <Text style={styles.primaryText}>Back home</Text>
      </Pressable>
    </Screen>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return <View style={styles.line}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  hero: { gap: 8 },
  eyebrow: { color: v2Theme.colors.brandStrong, fontSize: 11, fontWeight: "900", letterSpacing: 1.4 },
  title: { color: v2Theme.colors.ink, fontSize: 31, lineHeight: 36, fontWeight: "900", letterSpacing: -1 },
  body: { color: v2Theme.colors.inkSecondary, fontSize: 13, lineHeight: 19 },
  card: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, padding: 18, gap: 14 },
  line: { gap: 3 },
  label: { color: v2Theme.colors.inkTertiary, fontSize: 10, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase" },
  value: { color: v2Theme.colors.ink, fontSize: 14, lineHeight: 19, fontWeight: "800" },
  totalRow: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: v2Theme.colors.line, paddingTop: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  totalLabel: { color: v2Theme.colors.ink, fontSize: 14, fontWeight: "900" },
  total: { color: v2Theme.colors.ink, fontSize: 28, fontWeight: "900", letterSpacing: -1 },
  primary: { minHeight: 54, borderRadius: 18, backgroundColor: v2Theme.colors.brand, alignItems: "center", justifyContent: "center" },
  primaryText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  pressed: { opacity: 0.72 },
});
