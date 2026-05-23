import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { Ride } from "../../types/ride.types";
import { formatUsd } from "../../utils/formatPrice";
import { StatusBadge } from "../ui/StatusBadge";

export function RideCard({ ride, onPress }: { ride: Ride; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${ride.origin} to ${ride.destination}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.top}>
        <View>
          <Text style={styles.route}>{ride.origin} to {ride.destination}</Text>
          <Text style={styles.meta}>{ride.date} at {ride.time}</Text>
        </View>
        <Text style={styles.price}>{formatUsd(ride.price_usd)}</Text>
      </View>
      <View style={styles.row}>
        <MaterialCommunityIcons name="account-check-outline" size={18} color={colors.primaryGreen} />
        <Text style={styles.driver}>{ride.driver_name} - {ride.driver_rating.toFixed(1)}</Text>
      </View>
      <View style={styles.row}>
        <MaterialCommunityIcons name="car-outline" size={18} color={colors.mutedText} />
        <Text style={styles.meta}>{ride.vehicle}</Text>
      </View>
      <View style={styles.footer}>
        <StatusBadge label={`${ride.available_seats} seats available`} tone="success" />
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
  },
  pressed: {
    transform: [{ scale: 0.99 }],
  },
  top: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  route: {
    color: colors.whiteText,
    fontSize: 18,
    fontWeight: "900",
  },
  price: {
    color: colors.softGreen,
    fontSize: 20,
    fontWeight: "900",
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
