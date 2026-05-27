import { StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { PendingReview } from "../../types/review.types";
import { AppButton } from "../ui/AppButton";

export function ReviewPromptCard({ review, onPress }: { review: PendingReview; onPress: () => void }) {
  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <MaterialCommunityIcons name="star-check-outline" size={24} color={colors.primaryGreen} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>How was your trip?</Text>
        <Text style={styles.body}>
          Review {review.reviewee_name} from {review.ride_origin || "your ride"} to {review.ride_destination || "your destination"}.
        </Text>
      </View>
      <AppButton title="Review" variant="secondary" onPress={onPress} style={styles.button} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(17,139,68,0.26)",
    backgroundColor: "#F3FBF4",
    padding: spacing.md,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(17,139,68,0.12)",
  },
  copy: {
    flex: 1,
    gap: 3,
  },
  title: {
    color: colors.whiteText,
    fontWeight: "900",
  },
  body: {
    color: colors.mutedText,
    fontSize: 12,
    lineHeight: 17,
  },
  button: {
    minHeight: 42,
    paddingHorizontal: spacing.md,
  },
});
