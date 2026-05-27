import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ErrorState } from "../../../components/states/ErrorState";
import { LoadingState } from "../../../components/states/LoadingState";
import { AppButton } from "../../../components/ui/AppButton";
import { Avatar } from "../../../components/ui/Avatar";
import { Screen } from "../../../components/ui/Screen";
import { colors } from "../../../constants/colors";
import { spacing } from "../../../constants/spacing";
import { getPublicReviews } from "../../../services/reviewService";
import { ReviewSummary } from "../../../types/review.types";

export default function PassengerPublicProfileScreen() {
  const router = useRouter();
  const { id, name, photo, rideId } = useLocalSearchParams<{ id: string; name?: string; photo?: string; rideId?: string }>();
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const displayName = name || "Passenger";

  async function load() {
    try {
      setLoading(true);
      setError("");
      setSummary(await getPublicReviews(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load passenger profile.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) load();
  }, [id]);

  if (loading) {
    return (
      <Screen title="Passenger profile" showBack fallbackRoute="/(driver)/trips" navRole="driver">
        <LoadingState label="Loading passenger profile..." />
      </Screen>
    );
  }

  if (error || !summary) {
    return (
      <Screen title="Passenger profile" showBack fallbackRoute="/(driver)/trips" navRole="driver">
        <ErrorState message={error || "Passenger profile not found."} onRetry={load} />
      </Screen>
    );
  }

  const hasReviews = summary.review_count > 0 && typeof summary.average_rating === "number" && Number.isFinite(summary.average_rating);
  const ratingText = hasReviews ? `${Number(summary.average_rating).toFixed(1)} (${summary.review_count})` : "No reviews yet";
  const completedTrips = summary.completed_trips_count || 0;

  return (
    <Screen title="Passenger profile" showBack fallbackRoute="/(driver)/trips" navRole="driver">
      <View style={styles.hero}>
        <Avatar name={displayName} imageUri={photo || undefined} size={88} />
        <View style={styles.heroCopy}>
          <Text style={styles.title}>{displayName}</Text>
          <Text style={styles.body}>Public passenger trust profile</Text>
        </View>
      </View>

      <View style={styles.metrics}>
        <Metric icon="star" label="Average rating" value={ratingText} />
        <Metric icon="check-circle-outline" label="Completed ride trust score" value={completedTrips ? String(completedTrips) : "New"} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Reviews</Text>
        {summary.latest_reviews.length === 0 ? (
          <Text style={styles.body}>No reviews yet.</Text>
        ) : summary.latest_reviews.map((review) => (
          <View key={review.id} style={styles.reviewCard}>
            <View style={styles.reviewHeader}>
              <Text style={styles.reviewName}>{review.reviewer_name}</Text>
              <View style={styles.ratingRow}>
                <MaterialCommunityIcons name="star" size={15} color={colors.warning} />
                <Text style={styles.reviewRating}>{Number(review.rating).toFixed(1)}</Text>
              </View>
            </View>
            {review.comment ? <Text style={styles.body}>{review.comment}</Text> : null}
          </View>
        ))}
      </View>

      <View style={styles.actions}>
        <AppButton title="Report safety issue" variant="danger" onPress={() => router.push(`/(shared)/report?rideId=${rideId || ""}` as never)} />
        {rideId ? <AppButton title="Back to trip" variant="secondary" onPress={() => router.replace(`/(driver)/trip/${rideId}` as never)} /> : null}
      </View>
    </Screen>
  );
}

function Metric({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <MaterialCommunityIcons name={icon as never} size={20} color={colors.primaryGreen} />
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  heroCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    color: colors.whiteText,
    fontSize: 27,
    fontWeight: "900",
  },
  body: {
    color: colors.mutedText,
    lineHeight: 22,
  },
  metrics: {
    flexDirection: "row",
    gap: spacing.md,
  },
  metric: {
    flex: 1,
    minHeight: 94,
    justifyContent: "center",
    gap: 4,
    backgroundColor: colors.elevated,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  metricLabel: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: "800",
  },
  metricValue: {
    color: colors.whiteText,
    fontSize: 16,
    fontWeight: "900",
  },
  section: {
    backgroundColor: colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 18,
  },
  reviewCard: {
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  reviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  reviewName: {
    color: colors.whiteText,
    fontWeight: "900",
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  reviewRating: {
    color: colors.whiteText,
    fontWeight: "900",
  },
  actions: {
    gap: spacing.sm,
  },
});
