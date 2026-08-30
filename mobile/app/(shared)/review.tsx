import { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AppButton } from "../../components/ui/AppButton";
import { AppInput } from "../../components/ui/AppInput";
import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";
import { createReview } from "../../services/reviewService";
import { ReviewCategoryRatings, ReviewRole, ReviewTransactionType } from "../../types/review.types";

type Category = { key: keyof ReviewCategoryRatings; label: string };

const categoryLabels: Record<keyof ReviewCategoryRatings, string> = {
  safety: "Safety",
  punctuality: "Punctuality",
  communication: "Communication",
  vehicle_cleanliness: "Vehicle cleanliness",
  respectful_behavior: "Respectful behavior",
  payment_reliability: "Payment reliability",
  delivery_time: "Delivery time",
  package_handling: "Package handling",
  professionalism: "Professionalism",
  food_quality: "Food quality",
  order_accuracy: "Order accuracy",
  packaging: "Packaging",
  delivery_experience: "Delivery experience",
  handling: "Handling",
};

const roleCategories: Record<ReviewRole, Array<keyof ReviewCategoryRatings>> = {
  driver: ["safety", "punctuality", "communication", "vehicle_cleanliness"],
  passenger: ["communication", "respectful_behavior", "payment_reliability"],
  customer: ["communication", "respectful_behavior"],
  courier: ["delivery_time", "communication", "package_handling", "professionalism"],
  restaurant: ["food_quality", "order_accuracy", "packaging"],
};

function safeTransactionType(value?: string): ReviewTransactionType {
  if (["intercity", "hailing", "courier", "food_restaurant", "food_courier"].includes(value || "")) {
    return value as ReviewTransactionType;
  }
  return "intercity";
}

export default function ReviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    transactionId?: string;
    transactionType?: ReviewTransactionType;
    tripId?: string;
    revieweeId?: string;
    revieweeName?: string;
    reviewerRole?: ReviewRole;
    revieweeRole?: ReviewRole;
    categoryKeys?: string;
  }>();
  const [rating, setRating] = useState(0);
  const [categoryRatings, setCategoryRatings] = useState<ReviewCategoryRatings>({});
  const [comment, setComment] = useState("");
  const [safetyReportRequested, setSafetyReportRequested] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const transactionId = String(params.transactionId || params.tripId || "");
  const transactionType = safeTransactionType(params.transactionType);
  const revieweeRole = params.revieweeRole || "driver";
  const reviewerRole = params.reviewerRole || (revieweeRole === "restaurant" || revieweeRole === "courier" ? "customer" : "passenger");
  const revieweeName = params.revieweeName || (revieweeRole === "restaurant" ? "this restaurant" : `your ${revieweeRole}`);
  const canReportSafety = revieweeRole !== "restaurant";

  const categories = useMemo<Category[]>(() => {
    const supplied = String(params.categoryKeys || "")
      .split(",")
      .map((key) => key.trim())
      .filter((key): key is keyof ReviewCategoryRatings => key in categoryLabels);
    const keys = supplied.length ? supplied : roleCategories[revieweeRole];
    return keys.map((key) => ({ key, label: categoryLabels[key] }));
  }, [params.categoryKeys, revieweeRole]);

  function setCategoryScore(key: keyof ReviewCategoryRatings, value: number) {
    setCategoryRatings((current) => ({ ...current, [key]: value }));
  }

  async function submit(withSafetyReport: boolean) {
    if (!transactionId || !params.revieweeId) {
      setError("Review details are missing. Open the completed trip or order and try again.");
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
        transaction_id: transactionId,
        transaction_type: transactionType,
        reviewee_id: params.revieweeId,
        rating,
        category_ratings: categoryRatings,
        comment: comment.trim() || undefined,
        safety_report_requested: canReportSafety && withSafetyReport,
      });
      router.replace("/(shared)/activity" as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit review.");
    } finally {
      setSaving(false);
    }
  }

  function submitWithLowRatingCheck() {
    if (canReportSafety && rating <= 2 && !safetyReportRequested) {
      Alert.alert(
        "Do you want to report a safety issue?",
        "A safety report is private and is not added to the public review.",
        [
          { text: "No", onPress: () => void submit(false) },
          { text: "Report privately", onPress: () => void submit(true) },
        ],
      );
      return;
    }
    void submit(safetyReportRequested);
  }

  const title = revieweeRole === "restaurant" ? "How was your order?" : revieweeRole === "courier" ? "How was your delivery?" : "How was your ride?";

  return (
    <Screen title="Review" showBack fallbackRoute="/(shared)/activity" navRole={reviewerRole === "driver" ? "driver" : "customer"} showNotifications={false}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>COMPLETED {transactionType.replaceAll("_", " ").toUpperCase()}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>Rate {revieweeName}. Only reviews tied to completed LetsGoRide transactions can be submitted.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Overall</Text>
        <StarPicker value={rating} onChange={setRating} />
      </View>

      {categories.length ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>A little more detail</Text>
          {categories.map((category, index) => (
            <View key={category.key} style={[styles.categoryRow, index > 0 && styles.categoryBorder]}>
              <Text style={styles.categoryLabel}>{category.label}</Text>
              <StarPicker size={23} value={categoryRatings[category.key] || 0} onChange={(value) => setCategoryScore(category.key, value)} />
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.card}>
        <AppInput label="Comment" value={comment} onChangeText={setComment} placeholder="Optional public review" multiline />
        {canReportSafety ? (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: safetyReportRequested }}
            onPress={() => setSafetyReportRequested((value) => !value)}
            style={styles.checkboxRow}
          >
            <MaterialCommunityIcons name={safetyReportRequested ? "checkbox-marked-circle" : "checkbox-blank-circle-outline"} size={22} color={safetyReportRequested ? v2Theme.colors.ink : v2Theme.colors.inkTertiary} />
            <View style={styles.checkboxCopy}>
              <Text style={styles.checkboxTitle}>Private safety follow-up</Text>
              <Text style={styles.checkboxText}>Send this separately to the LetsGoRide safety team.</Text>
            </View>
          </Pressable>
        ) : null}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <AppButton title={saving ? "Submitting review…" : "Submit review"} disabled={saving} onPress={submitWithLowRatingCheck} />
      <Pressable accessibilityRole="button" onPress={() => router.replace("/(shared)/activity" as never)} style={styles.laterButton}>
        <Text style={styles.laterText}>Maybe later</Text>
      </Pressable>
    </Screen>
  );
}

function StarPicker({ value, onChange, size = 34 }: { value: number; onChange: (value: number) => void; size?: number }) {
  return (
    <View style={styles.stars}>
      {[1, 2, 3, 4, 5].map((score) => (
        <Pressable key={score} accessibilityRole="button" accessibilityLabel={`${score} star rating`} onPress={() => onChange(score)} hitSlop={8}>
          <MaterialCommunityIcons name={score <= value ? "star" : "star-outline"} size={size} color={score <= value ? "#111111" : "#B9BAB6"} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: 7 },
  eyebrow: { color: v2Theme.colors.inkTertiary, fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  title: { color: v2Theme.colors.ink, fontSize: 30, lineHeight: 35, fontWeight: "900", letterSpacing: -0.8 },
  body: { color: v2Theme.colors.inkSecondary, fontSize: 13, lineHeight: 20 },
  card: { gap: 14, backgroundColor: v2Theme.colors.surface, borderRadius: v2Theme.radius.xxl, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, padding: 17 },
  sectionTitle: { color: v2Theme.colors.ink, fontWeight: "900", fontSize: 17 },
  stars: { flexDirection: "row", alignItems: "center", gap: 8 },
  categoryRow: { gap: 8, paddingVertical: 4 },
  categoryBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: v2Theme.colors.line, paddingTop: 14 },
  categoryLabel: { color: v2Theme.colors.ink, fontWeight: "800", fontSize: 12 },
  checkboxRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 16, backgroundColor: v2Theme.colors.surfaceMuted, padding: 12 },
  checkboxCopy: { flex: 1, gap: 2 },
  checkboxTitle: { color: v2Theme.colors.ink, fontWeight: "900", fontSize: 11 },
  checkboxText: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15 },
  error: { color: v2Theme.colors.danger, fontWeight: "800", fontSize: 12 },
  laterButton: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  laterText: { color: v2Theme.colors.inkSecondary, fontSize: 12, fontWeight: "800" },
});
