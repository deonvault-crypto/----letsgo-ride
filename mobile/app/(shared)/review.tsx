import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AppButton } from "../../components/ui/AppButton";
import { AppInput } from "../../components/ui/AppInput";
import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";
import { createReview, listPendingReviews } from "../../services/reviewService";
import { PendingReview, ReviewCategoryRatings, ReviewRole, ReviewTransactionType } from "../../types/review.types";

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
  if (["intercity", "hailing", "courier", "food_restaurant", "food_courier"].includes(value || "")) return value as ReviewTransactionType;
  return "intercity";
}

function priority(review: PendingReview) {
  if (review.transaction_type === "food_restaurant") return 0;
  if (review.transaction_type === "food_courier") return 1;
  return 2;
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
  const transactionId = String(params.transactionId || params.tripId || "");
  const requestedType = safeTransactionType(params.transactionType);
  const [resolved, setResolved] = useState<PendingReview | null>(null);
  const [resolving, setResolving] = useState(!params.revieweeId);
  const [rating, setRating] = useState(0);
  const [categoryRatings, setCategoryRatings] = useState<ReviewCategoryRatings>({});
  const [comment, setComment] = useState("");
  const [safetyReportRequested, setSafetyReportRequested] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (params.revieweeId || !transactionId) return;
    let active = true;
    setResolving(true);
    void listPendingReviews()
      .then((items) => {
        if (!active) return;
        const sameTransaction = items
          .filter((item) => item.transaction_id === transactionId)
          .filter((item) => !params.transactionType || item.transaction_type === requestedType)
          .sort((a, b) => priority(a) - priority(b));
        setResolved(sameTransaction[0] || null);
        if (!sameTransaction.length) setError("There is no pending review for this completed transaction.");
      })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Unable to load review details."); })
      .finally(() => { if (active) setResolving(false); });
    return () => { active = false; };
  }, [params.revieweeId, params.transactionType, requestedType, transactionId]);

  const transactionType = resolved?.transaction_type || requestedType;
  const revieweeId = resolved?.reviewee_id || params.revieweeId || "";
  const revieweeRole = resolved?.reviewee_role || params.revieweeRole || "driver";
  const reviewerRole = resolved?.reviewer_role || params.reviewerRole || (revieweeRole === "restaurant" || revieweeRole === "courier" ? "customer" : "passenger");
  const revieweeName = resolved?.reviewee_name || params.revieweeName || (revieweeRole === "restaurant" ? "this restaurant" : `your ${revieweeRole}`);
  const canReportSafety = revieweeRole !== "restaurant";

  const categories = useMemo<Category[]>(() => {
    const supplied = resolved?.category_keys?.length
      ? resolved.category_keys
      : String(params.categoryKeys || "")
        .split(",")
        .map((key) => key.trim())
        .filter((key): key is keyof ReviewCategoryRatings => key in categoryLabels);
    const keys = supplied.length ? supplied : roleCategories[revieweeRole];
    return keys.map((key) => ({ key, label: categoryLabels[key] }));
  }, [params.categoryKeys, resolved?.category_keys, revieweeRole]);

  function resetFields() {
    setRating(0); setCategoryRatings({}); setComment(""); setSafetyReportRequested(false); setError("");
  }

  function setCategoryScore(key: keyof ReviewCategoryRatings, value: number) {
    setCategoryRatings((current) => ({ ...current, [key]: value }));
  }

  async function submit(withSafetyReport: boolean) {
    if (!transactionId || !revieweeId) return setError("Review details are missing. Open the completed trip or order and try again.");
    if (rating < 1) return setError("Choose an overall rating before submitting.");
    try {
      setSaving(true); setError("");
      await createReview({ transaction_id: transactionId, transaction_type: transactionType, reviewee_id: revieweeId, rating, category_ratings: categoryRatings, comment: comment.trim() || undefined, safety_report_requested: canReportSafety && withSafetyReport });
      const remaining = (await listPendingReviews())
        .filter((item) => item.transaction_id === transactionId)
        .sort((a, b) => priority(a) - priority(b));
      if (remaining.length) {
        resetFields();
        setResolved(remaining[0]);
        return;
      }
      router.replace("/(shared)/activity" as never);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to submit review."); }
    finally { setSaving(false); }
  }

  function submitWithLowRatingCheck() {
    if (canReportSafety && rating <= 2 && !safetyReportRequested) {
      Alert.alert("Do you want to report a safety issue?", "A safety report is private and is not added to the public review.", [
        { text: "No", onPress: () => void submit(false) },
        { text: "Report privately", onPress: () => void submit(true) },
      ]);
      return;
    }
    void submit(safetyReportRequested);
  }

  const title = revieweeRole === "restaurant" ? "How was your order?" : revieweeRole === "courier" ? "How was your delivery?" : "How was your ride?";

  return (
    <Screen title="Review" showBack fallbackRoute="/(shared)/activity" navRole={reviewerRole === "driver" ? "driver" : "customer"} showNotifications={false}>
      {resolving ? <ReviewSkeleton /> : null}
      {!resolving && revieweeId ? <>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>COMPLETED {transactionType.replaceAll("_", " ").toUpperCase()}</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>Rate {revieweeName}. Only reviews tied to completed LetsGoRide transactions can be submitted.</Text>
        </View>
        <View style={styles.card}><Text style={styles.sectionTitle}>Overall</Text><StarPicker value={rating} onChange={setRating} /></View>
        {categories.length ? <View style={styles.card}><Text style={styles.sectionTitle}>A little more detail</Text>{categories.map((category, index) => <View key={category.key} style={[styles.categoryRow, index > 0 && styles.categoryBorder]}><Text style={styles.categoryLabel}>{category.label}</Text><StarPicker size={23} value={categoryRatings[category.key] || 0} onChange={(value) => setCategoryScore(category.key, value)} /></View>)}</View> : null}
        <View style={styles.card}>
          <AppInput label="Comment" value={comment} onChangeText={setComment} placeholder="Optional public review" multiline />
          {canReportSafety ? <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: safetyReportRequested }} onPress={() => setSafetyReportRequested((value) => !value)} style={styles.checkboxRow}><MaterialCommunityIcons name={safetyReportRequested ? "checkbox-marked-circle" : "checkbox-blank-circle-outline"} size={22} color={safetyReportRequested ? v2Theme.colors.ink : v2Theme.colors.inkTertiary} /><View style={styles.checkboxCopy}><Text style={styles.checkboxTitle}>Private safety follow-up</Text><Text style={styles.checkboxText}>Send this separately to the LetsGoRide safety team.</Text></View></Pressable> : null}
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <AppButton title={saving ? "Submitting review…" : "Submit review"} disabled={saving} onPress={submitWithLowRatingCheck} />
        <Pressable accessibilityRole="button" disabled={saving} onPress={() => router.replace("/(shared)/activity" as never)} style={styles.laterButton}><Text style={styles.laterText}>Maybe later</Text></Pressable>
      </> : null}
      {!resolving && !revieweeId && error ? <View style={styles.emptyCard}><MaterialCommunityIcons name="check-circle-outline" size={25} color={v2Theme.colors.ink} /><Text style={styles.emptyTitle}>Nothing to rate here</Text><Text style={styles.emptyBody}>{error}</Text><Pressable accessibilityRole="button" onPress={() => router.replace("/(shared)/activity" as never)}><Text style={styles.backText}>Back to Activity</Text></Pressable></View> : null}
    </Screen>
  );
}

function ReviewSkeleton() { return <View style={styles.skeleton}><View style={styles.skeletonTitle} /><View style={styles.skeletonCard} /><View style={styles.skeletonCard} /><Text style={styles.skeletonText}>Loading your completed transaction…</Text></View>; }
function StarPicker({ value, onChange, size = 34 }: { value: number; onChange: (value: number) => void; size?: number }) { return <View style={styles.stars}>{[1, 2, 3, 4, 5].map((score) => <Pressable key={score} accessibilityRole="button" accessibilityLabel={`${score} star rating`} onPress={() => onChange(score)} hitSlop={8}><MaterialCommunityIcons name={score <= value ? "star" : "star-outline"} size={size} color={score <= value ? "#111111" : "#B9BAB6"} /></Pressable>)}</View>; }

const styles = StyleSheet.create({
  header: { gap: 7 }, eyebrow: { color: v2Theme.colors.inkTertiary, fontSize: 9, fontWeight: "900", letterSpacing: 1.1 }, title: { color: v2Theme.colors.ink, fontSize: 30, lineHeight: 35, fontWeight: "900", letterSpacing: -0.8 }, body: { color: v2Theme.colors.inkSecondary, fontSize: 13, lineHeight: 20 },
  card: { gap: 14, backgroundColor: v2Theme.colors.surface, borderRadius: v2Theme.radius.xxl, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, padding: 17 }, sectionTitle: { color: v2Theme.colors.ink, fontWeight: "900", fontSize: 17 }, stars: { flexDirection: "row", alignItems: "center", gap: 8 }, categoryRow: { gap: 8, paddingVertical: 4 }, categoryBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: v2Theme.colors.line, paddingTop: 14 }, categoryLabel: { color: v2Theme.colors.ink, fontWeight: "800", fontSize: 12 },
  checkboxRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 16, backgroundColor: v2Theme.colors.surfaceMuted, padding: 12 }, checkboxCopy: { flex: 1, gap: 2 }, checkboxTitle: { color: v2Theme.colors.ink, fontWeight: "900", fontSize: 11 }, checkboxText: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15 }, error: { color: v2Theme.colors.danger, fontWeight: "800", fontSize: 12 }, laterButton: { minHeight: 44, alignItems: "center", justifyContent: "center" }, laterText: { color: v2Theme.colors.inkSecondary, fontSize: 12, fontWeight: "800" },
  skeleton: { gap: 12 }, skeletonTitle: { width: "68%", height: 28, borderRadius: 10, backgroundColor: v2Theme.colors.surfaceMuted }, skeletonCard: { height: 116, borderRadius: 22, backgroundColor: v2Theme.colors.surfaceMuted }, skeletonText: { color: v2Theme.colors.inkSecondary, fontSize: 10, fontWeight: "700" }, emptyCard: { borderRadius: 22, backgroundColor: v2Theme.colors.surface, padding: 17, gap: 7 }, emptyTitle: { color: v2Theme.colors.ink, fontSize: 17, fontWeight: "900" }, emptyBody: { color: v2Theme.colors.inkSecondary, fontSize: 11, lineHeight: 17 }, backText: { color: v2Theme.colors.ink, fontSize: 11, fontWeight: "900", marginTop: 5 },
});
