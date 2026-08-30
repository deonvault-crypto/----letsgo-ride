import { MaterialCommunityIcons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { v2Theme } from "../../constants/v2Theme";
import { useSession } from "../../contexts/SessionContext";
import { listPendingReviews } from "../../services/reviewService";
import { PendingReview } from "../../types/review.types";

function safePath(pathname: string) {
  return pathname.endsWith("/home") || pathname.endsWith("/activity") || pathname.endsWith("/account") || pathname.endsWith("/my-trips");
}

function promptCopy(review: PendingReview) {
  if (review.reviewee_role === "restaurant") return { title: "Rate your recent order", body: `How was ${review.reviewee_name}?` };
  if (review.reviewee_role === "courier") return { title: "Rate your courier", body: `How was your delivery with ${review.reviewee_name}?` };
  if (review.reviewee_role === "driver") return { title: "Rate your recent ride", body: `How was your ride with ${review.reviewee_name}?` };
  return { title: "Leave a quick review", body: `How was your experience with ${review.reviewee_name}?` };
}

export function PendingReviewReminder() {
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, loading, isGuest } = useSession();
  const [review, setReview] = useState<PendingReview | null>(null);
  const dismissed = useRef(new Set<string>());

  useEffect(() => {
    if (loading || isGuest || !user?.id || !safePath(pathname)) {
      setReview(null);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      void listPendingReviews().then((items) => {
        if (!active) return;
        const next = items.find((item) => !dismissed.current.has(`${item.transaction_type}:${item.transaction_id}:${item.reviewee_id}`));
        setReview(next || null);
      }).catch(() => { if (active) setReview(null); });
    }, 600);
    return () => { active = false; clearTimeout(timer); };
  }, [isGuest, loading, pathname, user?.id]);

  if (!review || !safePath(pathname)) return null;
  const key = `${review.transaction_type}:${review.transaction_id}:${review.reviewee_id}`;
  const copy = promptCopy(review);

  function dismiss() {
    dismissed.current.add(key);
    setReview(null);
  }

  function openReview() {
    setReview(null);
    router.push({ pathname: "/(shared)/review", params: { transactionId: review.transaction_id, transactionType: review.transaction_type } } as never);
  }

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <View style={[styles.card, { bottom: Math.max(insets.bottom, 10) + 76 }]}>
        <View style={styles.icon}><MaterialCommunityIcons name="star-outline" size={21} color="#111111" /></View>
        <Pressable accessibilityRole="button" onPress={openReview} style={styles.copy}>
          <Text style={styles.title}>{copy.title}</Text>
          <Text numberOfLines={1} style={styles.body}>{copy.body}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Review later" onPress={dismiss} hitSlop={10} style={styles.close}>
          <MaterialCommunityIcons name="close" size={18} color={v2Theme.colors.inkSecondary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    left: 12,
    right: 12,
    minHeight: 68,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.98)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.12)",
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 7 },
    elevation: 8,
  },
  icon: { width: 40, height: 40, borderRadius: 13, backgroundColor: "#F1F1EE", alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, minHeight: 48, justifyContent: "center" },
  title: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900" },
  body: { color: v2Theme.colors.inkSecondary, fontSize: 9, marginTop: 2 },
  close: { width: 32, height: 40, alignItems: "center", justifyContent: "center" },
});
