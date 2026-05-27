import { GestureResponderEvent, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { Ride } from "../../types/ride.types";
import { formatTripDate } from "../../utils/formatDate";
import { formatUsd } from "../../utils/formatPrice";
import { canonicalRideStatus, isRideBookable, tripStatusLabel, tripStatusTone } from "../../utils/tripLifecycle";
import { isVerifiedStatus } from "../../utils/verificationStatus";
import { Avatar } from "../ui/Avatar";
import { StatusBadge } from "../ui/StatusBadge";
import { VerifiedBadge } from "../ui/VerifiedBadge";

export function RideCard({ ride, onPress, onDriverPress }: { ride: Ride; onPress?: () => void; onDriverPress?: () => void }) {
  const status = canonicalRideStatus(ride.status);
  const isBookable = isRideBookable(ride);
  const isFull = Number(ride.available_seats || 0) <= 0;
  const reviewCount = Number(ride.driver_review_count || 0);
  const hasReviews = reviewCount > 0 && typeof ride.driver_rating === "number" && Number.isFinite(ride.driver_rating);
  function handleDriverPress(event: GestureResponderEvent) {
    event.stopPropagation();
    onDriverPress?.();
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${ride.origin} to ${ride.destination}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.top}>
        <View style={styles.routeCopy}>
          <Text style={styles.route}>{ride.origin} to {ride.destination}</Text>
          <Text style={styles.meta}>{formatTripDate(ride.date, ride.time)}</Text>
          <Text style={styles.price}>{formatUsd(ride.price_usd)}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${ride.driver_name}'s profile`}
          disabled={!onDriverPress}
          onPress={handleDriverPress}
          style={({ pressed }) => [styles.driverPreview, pressed && styles.driverPreviewPressed]}
        >
          <Avatar name={ride.driver_name} imageUri={ride.driver_profile_photo_url || ride.driver_avatar_url || undefined} size={64} />
        </Pressable>
      </View>
      <View style={styles.row}>
        <View style={styles.driverCopy}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${ride.driver_name}'s profile`}
            disabled={!onDriverPress}
            onPress={handleDriverPress}
            style={({ pressed }) => [styles.driverNameRow, pressed && styles.linkPressed]}
          >
            <Text style={styles.driver}>{ride.driver_name}</Text>
            <VerifiedBadge verified={isVerifiedStatus(ride.driver_verification_status)} />
            {ride.is_own_ride ? <StatusBadge label="Your ride" tone="neutral" /> : null}
          </Pressable>
          {hasReviews ? (
            <View style={styles.inlineRow}>
              <MaterialCommunityIcons name="star" size={15} color={colors.warning} />
              <Text style={styles.meta}>{ride.driver_rating!.toFixed(1)} · {reviewCount} {reviewCount === 1 ? "review" : "reviews"}</Text>
            </View>
          ) : (
            <Text style={styles.meta}>No reviews yet</Text>
          )}
        </View>
      </View>
      <View style={styles.row}>
        <MaterialCommunityIcons name="car-outline" size={18} color={colors.mutedText} />
        <Text style={styles.meta}>{ride.vehicle}</Text>
      </View>
      <View style={styles.footer}>
        {status !== "SCHEDULED" ? (
          <StatusBadge label={tripStatusLabel(status)} tone={tripStatusTone(status)} />
        ) : isFull ? (
          <StatusBadge label="Full" tone="neutral" />
        ) : !isBookable ? (
          <StatusBadge label="Not bookable" tone="neutral" />
        ) : (
          <StatusBadge label={`${ride.available_seats} seats available`} tone="success" />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 24,
    padding: spacing.lg,
    gap: spacing.md,
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  pressed: {
    transform: [{ scale: 0.99 }],
  },
  top: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  routeCopy: {
    flex: 1,
    gap: 4,
  },
  route: {
    color: colors.whiteText,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 23,
  },
  price: {
    color: colors.softGreen,
    fontSize: 20,
    fontWeight: "900",
    marginTop: spacing.xs,
  },
  driverPreview: {
    width: 76,
    height: 76,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  driverPreviewPressed: {
    transform: [{ scale: 0.97 }],
  },
  meta: {
    color: colors.mutedText,
    fontSize: 13,
    lineHeight: 19,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  inlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  driverCopy: {
    flex: 1,
    gap: 3,
  },
  driverNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexWrap: "wrap",
  },
  linkPressed: {
    opacity: 0.75,
  },
  driver: {
    color: colors.whiteText,
    fontWeight: "700",
  },
  footer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
});
