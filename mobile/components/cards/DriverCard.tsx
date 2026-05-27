import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { Avatar } from "../ui/Avatar";
import { StatusBadge } from "../ui/StatusBadge";
import { VerifiedBadge } from "../ui/VerifiedBadge";

export function DriverCard({
  name,
  rating,
  vehicle,
  verified = false,
  imageUri,
  onPress,
  reviewCount = 0,
  completedTripsCount,
}: {
  name: string;
  rating?: number | null;
  vehicle?: string;
  verified?: boolean;
  imageUri?: string | null;
  onPress?: () => void;
  reviewCount?: number;
  completedTripsCount?: number;
}) {
  const hasReviews = Number(reviewCount || 0) > 0 && typeof rating === "number" && Number.isFinite(rating);
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={onPress ? `Open ${name}'s profile` : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <Avatar name={name} imageUri={imageUri || undefined} />
      <View style={styles.body}>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{name}</Text>
          <VerifiedBadge verified={verified} />
        </View>
        {hasReviews ? (
          <View style={styles.row}>
            <MaterialCommunityIcons name="star" size={16} color={colors.warning} />
            <Text style={styles.meta}>
              {rating.toFixed(1)} · {reviewCount} {reviewCount === 1 ? "review" : "reviews"}
            </Text>
          </View>
        ) : (
          <Text style={styles.meta}>No reviews yet</Text>
        )}
        {completedTripsCount ? <Text style={styles.meta}>{completedTripsCount} completed trips</Text> : null}
        {vehicle ? <Text style={styles.meta}>{vehicle}</Text> : null}
      </View>
      {verified ? <StatusBadge label="Identity verified" tone="neutral" /> : <StatusBadge label="Pending" tone="warning" />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: spacing.lg,
  },
  pressed: {
    transform: [{ scale: 0.99 }],
  },
  body: {
    flex: 1,
    gap: 3,
  },
  name: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 16,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexWrap: "wrap",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  meta: {
    color: colors.mutedText,
    fontSize: 13,
  },
});
