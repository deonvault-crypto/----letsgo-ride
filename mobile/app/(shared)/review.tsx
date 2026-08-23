import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AppButton } from "../../components/ui/AppButton";
import { AppInput } from "../../components/ui/AppInput";
import { Screen } from "../../components/ui/Screen";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { createReview } from "../../services/reviewService";
import { ReviewCategoryRatings, ReviewRole } from "../../types/review.types";

type Category = {
  key: keyof ReviewCategoryRatings;
  label: string;
};

const driverCategories: Category[] = [
  { key: "safety", label: "Safety" },
  { key: "punctuality", label: "Punctuality" },
  { key: "communication", label: "Communication" },
  { key: "vehicle_cleanliness", label: "Vehicle cleanliness" },
];

const passengerCategories: Category[] = [
  { key: "punctuality", label: "Punctuality" },
  { key: "respectful_behavior", label: "Respectful behavior" },
  { key: "payment_reliability", label: "Booking reliability" },
];

export default function ReviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    tripId?: string;
    revieweeId?: string;
    revieweeName?: string;
    reviewerRole?: ReviewRole;
    revieweeRole?: ReviewRole;
  }>();
  const [rating, setRating] = useState(0);
  const [categoryRatings, setCategoryRatings] = useState<ReviewCategoryRatings>({});
  const [comment, setComment] = useState("");
  const [safetyReportRequested, setSafetyReportRequested] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const revieweeRole = params.revieweeRole || "driver";
  const reviewerRole = params.reviewerRole || "passenger";
  const categories = revieweeRole === "driver" ? driverCategories : passengerCategories;
  const revieweeName = params.revieweeName || (revieweeRole === "driver" ? "your driver" : "your passenger");

  function setCategoryScore(key: keyof ReviewCategoryRatings, value: number) {
    setCategoryRatings((current) => ({ ...current, [key]: value }));
  }

  async function submit(withSafetyReport: boolean) {
    if (!params.tripId || !params.revieweeId) {
      setError("Review details are missing.");
      return;
    }
    if (rating < 1) {
      setError("Choose an overall rating before submitting.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      await createReview({
        trip_id: params.tripId,
        reviewee_id: params.revieweeId,
        rating,
        category_ratings: categoryRatings,
        comment,
        safety_report_requested: withSafetyReport,
      });
      router.replace(
        reviewerRole === "driver" && params.tripId
          ? `/(driver)/trip/${params.tripId}` as never
          : params.tripId
            ? `/(customer)/ride/${params.tripId}` as never
            : "/(customer)/my-trips" as never,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit review.");
    } finally {
      setSaving(false);
    }
  }

  function submitWithLowRatingCheck() {
    if (rating <= 2 && !safetyReportRequested) {
      Alert.alert("Do you want to report a safety issue?", "Safety reports are private and visible only to authorized admins.", [
        { text: "No", style: "cancel", onPress: () => submit(false) },
        { text: "Yes", onPress: () => submit(true) },
      ]);
      return;
    }
    submit(safetyReportRequested);
  }

  return (
    <Screen title="Review" showBack fallbackRoute={reviewerRole === "driver" ? "/(driver)/trips" : "/(customer)/my-trips"} navRole={reviewerRole === "driver" ? "driver" : "customer"}>
      <View style={styles.header}>
        <Text style={styles.title}>How was your trip?</Text>
        <Text style={styles.body}>Share a quick review for {revieweeName}. Private safety reports are not shown publicly.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Overall rating</Text>
        <StarPicker value={rating} onChange={setRating} />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Trip details</Text>
        {categories.map((category) => (
          <View key={category.key} style={styles.categoryRow}>
            <Text style={styles.categoryLabel}>{category.label}</Text>
            <StarPicker size={22} value={categoryRatings[category.key] || 0} onChange={(value) => setCategoryScore(category.key, value)} />
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <AppInput label="Comment" value={comment} onChangeText={setComment} placeholder="Optional public review" multiline />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={revieweeRole === "driver" ? "Report unsafe driving option" : "Report safety issue option"}
          onPress={() => setSafetyReportRequested((value) => !value)}
          style={styles.checkboxRow}
        >
          <MaterialCommunityIcons
            name={safetyReportRequested ? "checkbox-marked-circle" : "checkbox-blank-circle-outline"}
            size={22}
            color={safetyReportRequested ? colors.primaryGreen : colors.mutedText}
          />
          <Text style={styles.checkboxText}>
            {revieweeRole === "driver" ? "Report unsafe driving to LetsGoRide safety review" : "Report a passenger safety issue"}
          </Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <AppButton title="Submit review" loading={saving} onPress={submitWithLowRatingCheck} />
    </Screen>
  );
}

function StarPicker({ value, onChange, size = 32 }: { value: number; onChange: (value: number) => void; size?: number }) {
  return (
    <View style={styles.stars}>
      {[1, 2, 3, 4, 5].map((score) => (
        <Pressable
          key={score}
          accessibilityRole="button"
          accessibilityLabel={`${score} star rating`}
          onPress={() => onChange(score)}
          hitSlop={8}
        >
          <MaterialCommunityIcons name={score <= value ? "star" : "star-outline"} size={size} color={colors.warning} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.sm,
  },
  title: {
    color: colors.whiteText,
    fontSize: 30,
    fontWeight: "900",
  },
  body: {
    color: colors.mutedText,
    lineHeight: 22,
  },
  card: {
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  sectionTitle: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 18,
  },
  stars: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  categoryRow: {
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  categoryLabel: {
    color: colors.whiteText,
    fontWeight: "800",
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  checkboxText: {
    flex: 1,
    color: colors.whiteText,
    fontWeight: "800",
    lineHeight: 20,
  },
  error: {
    color: colors.danger,
    fontWeight: "800",
  },
});
