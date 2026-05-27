import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { ErrorState } from "../../../components/states/ErrorState";
import { LoadingState } from "../../../components/states/LoadingState";
import { AppButton } from "../../../components/ui/AppButton";
import { Avatar } from "../../../components/ui/Avatar";
import { Screen } from "../../../components/ui/Screen";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { VerifiedBadge } from "../../../components/ui/VerifiedBadge";
import { colors } from "../../../constants/colors";
import { spacing } from "../../../constants/spacing";
import { getDriverPublicProfile } from "../../../services/reviewService";
import { DriverPublicProfile } from "../../../types/review.types";
import { formatStatus } from "../../../utils/formatStatus";
import { isVerifiedStatus } from "../../../utils/verificationStatus";

export default function DriverPublicProfileScreen() {
  const router = useRouter();
  const { id, rideId } = useLocalSearchParams<{ id: string; rideId?: string }>();
  const [profile, setProfile] = useState<DriverPublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    try {
      setLoading(true);
      setError("");
      setProfile(await getDriverPublicProfile(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load driver profile.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) load();
  }, [id]);

  if (loading) {
    return (
      <Screen title="Driver profile" showBack fallbackRoute="/(passenger)/home" navRole="passenger">
        <LoadingState label="Loading driver profile..." />
      </Screen>
    );
  }

  if (error || !profile) {
    return (
      <Screen title="Driver profile" showBack fallbackRoute="/(passenger)/home" navRole="passenger">
        <ErrorState message={error || "Driver profile not found."} onRetry={load} />
      </Screen>
    );
  }

  const reviewCount = profile.review_count || 0;
  const hasReviews = reviewCount > 0 && typeof profile.average_rating === "number" && Number.isFinite(profile.average_rating);
  const ratingText = hasReviews ? `${Number(profile.average_rating).toFixed(1)} (${reviewCount})` : "No reviews yet";
  const completedTrips = profile.completed_trips_count || 0;

  return (
    <Screen title="Driver profile" showBack fallbackRoute="/(passenger)/home" navRole="passenger">
      <View style={styles.hero}>
        <Avatar name={profile.name} imageUri={profile.profile_photo_url || undefined} size={94} />
        <View style={styles.heroCopy}>
          <View style={styles.nameRow}>
            <Text style={styles.title}>{profile.name}</Text>
            <VerifiedBadge verified={profile.verified || isVerifiedStatus(profile.verification_status)} size="medium" />
          </View>
          <View style={styles.badgeRow}>
            <StatusBadge label={formatStatus(profile.verification_status)} tone={isVerifiedStatus(profile.verification_status) ? "success" : "warning"} />
            {profile.verified ? <StatusBadge label="Verified driver" tone="success" /> : null}
          </View>
        </View>
      </View>

      <View style={styles.metrics}>
        <Metric icon="star" label="Rating" value={ratingText} />
        <Metric icon="check-circle-outline" label="Completed trips" value={completedTrips ? String(completedTrips) : "New"} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Vehicle</Text>
        <Text style={styles.body}>{profile.vehicle_name || profile.vehicle || "Vehicle details available on the ride."}</Text>
        {profile.vehicle_color ? <Text style={styles.body}>Color: {profile.vehicle_color}</Text> : null}
      </View>

      {profile.bio ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.body}>{profile.bio}</Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Reviews</Text>
          <Text style={styles.reviewCount}>{reviewCount ? `${reviewCount} total` : "No reviews yet"}</Text>
        </View>
        {profile.latest_reviews.length === 0 ? (
          <Text style={styles.body}>No reviews yet.</Text>
        ) : profile.latest_reviews.map((review) => (
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
        {rideId ? (
          <AppButton title="Back to ride details" variant="secondary" onPress={() => router.replace(`/(passenger)/ride/${rideId}` as never)} />
        ) : (
          <AppButton title="Back" variant="secondary" onPress={() => router.back()} />
        )}
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
    gap: spacing.sm,
  },
  title: {
    color: colors.whiteText,
    fontSize: 27,
    fontWeight: "900",
    lineHeight: 32,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
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
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.whiteText,
    fontSize: 18,
    fontWeight: "900",
  },
  reviewCount: {
    color: colors.mutedText,
    fontWeight: "800",
  },
  body: {
    color: colors.mutedText,
    lineHeight: 22,
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
