import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppNotice } from "../../../../components/ui/AppNotice";
import { Screen } from "../../../../components/ui/Screen";
import { MotionView } from "../../../../components/ui/MotionView";
import { v2Theme } from "../../../../constants/v2Theme";
import { getHailingTrip } from "../../../../services/hailingService";
import { listPendingReviews } from "../../../../services/reviewService";
import { HailingTrip } from "../../../../types/hailing.types";
import { PendingReview } from "../../../../types/review.types";

export default function HailingReceiptScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const tripId = String(params.id || "");
  const [trip, setTrip] = useState<HailingTrip | null>(null);
  const [pendingReview, setPendingReview] = useState<PendingReview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [nextTrip, pending] = await Promise.all([getHailingTrip(tripId), listPendingReviews()]);
      setTrip(nextTrip);
      setPendingReview(pending.find((review) => review.transaction_type === "hailing" && review.transaction_id === tripId && review.reviewee_role === "driver") || null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load this receipt.");
    }
  }, [tripId]);

  useEffect(() => { void load(); }, [load]);

  const driverName = useMemo(() => pendingReview?.reviewee_name || trip?.driver?.name || "your driver", [pendingReview?.reviewee_name, trip?.driver?.name]);

  function rateDriver() {
    if (!pendingReview) return;
    router.push({
      pathname: "/(shared)/review",
      params: {
        transactionId: pendingReview.transaction_id,
        transactionType: pendingReview.transaction_type,
        revieweeId: pendingReview.reviewee_id,
        revieweeName: pendingReview.reviewee_name,
        reviewerRole: pendingReview.reviewer_role,
        revieweeRole: pendingReview.reviewee_role,
        categoryKeys: (pendingReview.category_keys || []).join(","),
      },
    } as never);
  }

  return (
    <Screen navRole="customer" onRefresh={load} showNotifications={false}>
      <MotionView changeKey={trip?.status || "loading"} style={styles.hero}>
        {trip?.status === "COMPLETED" ? <MaterialCommunityIcons accessibilityLabel="Ride completed" name="check-circle-outline" size={26} color={v2Theme.colors.ink} /> : null}
        <Text style={styles.eyebrow}>RIDE RECEIPT</Text>
        <Text style={styles.title}>{trip?.status === "COMPLETED" ? "Ride complete" : trip ? "Ride receipt" : error ? "Receipt unavailable" : "Loading receipt…"}</Text>
        <Text style={styles.body}>{trip?.status === "COMPLETED" ? "Your fare and ride details are saved in Activity." : "Your receipt is available after the ride is complete."}</Text>
      </MotionView>
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

      {pendingReview ? (
        <View style={styles.ratingCard}>
          <View style={styles.ratingIcon}><MaterialCommunityIcons name="star-outline" size={23} color="#111111" /></View>
          <View style={styles.ratingCopy}>
            <Text style={styles.ratingTitle}>How was your ride with {driverName}?</Text>
            <Text style={styles.ratingBody}>Your rating only unlocks after a completed trip and helps future riders understand the experience.</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={rateDriver} style={({ pressed }) => [styles.rateButton, pressed && styles.pressed]}>
            <Text style={styles.rateButtonText}>Rate driver</Text>
            <MaterialCommunityIcons name="arrow-right" size={18} color="#FFFFFF" />
          </Pressable>
        </View>
      ) : trip ? (
        <View style={styles.ratedStrip}><MaterialCommunityIcons name="check-circle-outline" size={19} color={v2Theme.colors.inkSecondary} /><Text style={styles.ratedText}>Thanks — there is no pending driver review for this ride.</Text></View>
      ) : null}

      <Pressable accessibilityRole="button" onPress={() => router.replace("/(customer)/home" as never)} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
        <Text style={styles.secondaryText}>Back home</Text>
      </Pressable>
    </Screen>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return <View style={styles.line}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  hero: { gap: 8 },
  eyebrow: { color: "#111111", fontSize: 10, fontWeight: "900", letterSpacing: 1.35 },
  title: { color: v2Theme.colors.ink, fontSize: 24, lineHeight: 29, fontWeight: "800", letterSpacing: -0.5 },
  body: { color: v2Theme.colors.inkSecondary, fontSize: 13, lineHeight: 19 },
  card: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, padding: 18, gap: 14 },
  line: { gap: 3 },
  label: { color: v2Theme.colors.inkTertiary, fontSize: 10, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase" },
  value: { color: v2Theme.colors.ink, fontSize: 14, lineHeight: 19, fontWeight: "800" },
  totalRow: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: v2Theme.colors.line, paddingTop: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  totalLabel: { color: v2Theme.colors.ink, fontSize: 14, fontWeight: "900" },
  total: { color: v2Theme.colors.ink, fontSize: 28, fontWeight: "900", letterSpacing: -1 },
  ratingCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: "#F5F5F2", borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, padding: 15, gap: 12 },
  ratingIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  ratingCopy: { gap: 4 },
  ratingTitle: { color: v2Theme.colors.ink, fontSize: 16, lineHeight: 21, fontWeight: "900" },
  ratingBody: { color: v2Theme.colors.inkSecondary, fontSize: 11, lineHeight: 17 },
  rateButton: { minHeight: 50, borderRadius: 17, backgroundColor: "#111111", paddingHorizontal: 15, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rateButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  ratedStrip: { minHeight: 48, borderRadius: 16, backgroundColor: v2Theme.colors.surfaceMuted, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 8 },
  ratedText: { flex: 1, color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15, fontWeight: "700" },
  secondary: { minHeight: 52, borderRadius: 18, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: v2Theme.colors.ink, fontSize: 13, fontWeight: "900" },
  pressed: { opacity: 0.72 },
});
