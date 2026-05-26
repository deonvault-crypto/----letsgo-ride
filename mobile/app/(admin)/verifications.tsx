import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { EmptyState } from "../../components/states/EmptyState";
import { ErrorState } from "../../components/states/ErrorState";
import { LoadingState } from "../../components/states/LoadingState";
import { AppButton } from "../../components/ui/AppButton";
import { AppInput } from "../../components/ui/AppInput";
import { Screen } from "../../components/ui/Screen";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { useLiveRefresh } from "../../hooks/useLiveRefresh";
import { listAdminVerifications } from "../../services/adminService";
import { AdminVerificationListItem } from "../../types/verification.types";
import { formatStatus } from "../../utils/formatStatus";
import { isPendingVerificationStatus, isVerifiedStatus, needsVerificationReview } from "../../utils/verificationStatus";

export default function AdminVerificationsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<AdminVerificationListItem[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const result = await listAdminVerifications();
      setItems(result.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load verifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useLiveRefresh(load, 15000);

  const pendingCount = items.filter((item) => isPendingVerificationStatus(item.verification_status) || item.verification_status === "flagged_for_review").length;
  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        const matchesFilter = filter === "all" || item.verification_status === filter;
        const term = search.trim().toLowerCase();
        const matchesSearch = !term || [item.name, item.email, item.phone, item.city, item.verification_status].some((value) => String(value || "").toLowerCase().includes(term));
        return matchesFilter && matchesSearch;
      }),
    [filter, items, search],
  );

  return (
    <Screen title="Admin">
      <View style={styles.hero}>
        <StatusBadge label={`${pendingCount} pending`} tone={pendingCount > 0 ? "warning" : "success"} />
        <Text style={styles.title}>Driver verifications</Text>
        <Text style={styles.body}>Review manual driver identity and vehicle submissions.</Text>
      </View>

      {loading ? <LoadingState label="Loading verification queue..." /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error ? (
        <>
          <AppInput label="Search" value={search} onChangeText={setSearch} leftIcon="magnify" placeholder="Search by name, email, phone, city, or status" />
          <View style={styles.filters}>
            {["all", "pending", "processing_biometrics", "flagged_for_review", "needs_review", "verified", "active", "rejected"].map((value) => (
              <Pressable
                key={value}
                accessibilityRole="button"
                onPress={() => setFilter(value)}
                style={({ pressed }) => [styles.filterChip, filter === value && styles.filterChipActive, pressed && styles.pressed]}
              >
                <Text style={[styles.filterText, filter === value && styles.filterTextActive]}>{formatStatus(value)}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {!loading && !error && filteredItems.length === 0 ? (
        <EmptyState title="No pending verifications" body="Driver verification submissions will appear here when they match your filter." />
      ) : null}

      {!loading && !error && filteredItems.map((item) => (
        <View key={item.driver_id} style={styles.card}>
          <StatusBadge label={formatStatus(item.verification_status)} tone={statusTone(item.verification_status)} />
          <Text style={styles.cardTitle}>{item.name || "Driver"}</Text>
          <Text style={styles.body}>{item.phone || item.email || "No contact on file"}</Text>
          <Text style={styles.body}>{item.city || "City not set"} - {item.document_count} documents</Text>
          <AppButton
            title="Review submission"
            variant="secondary"
            onPress={() => router.push(`/(admin)/verification/${item.driver_id}` as never)}
          />
        </View>
      ))}
    </Screen>
  );
}

function statusTone(status: AdminVerificationListItem["verification_status"]): "success" | "warning" | "danger" | "neutral" {
  if (isVerifiedStatus(status)) return "success";
  if (status === "rejected") return "danger";
  if (isPendingVerificationStatus(status) || needsVerificationReview(status)) return "warning";
  return "neutral";
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.card,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.md,
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
    backgroundColor: colors.card,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardTitle: {
    color: colors.whiteText,
    fontSize: 20,
    fontWeight: "900",
  },
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  filterChipActive: {
    backgroundColor: "rgba(17,139,68,0.12)",
    borderColor: "rgba(17,139,68,0.36)",
  },
  filterText: {
    color: colors.mutedText,
    fontWeight: "800",
    fontSize: 12,
  },
  filterTextActive: {
    color: colors.primaryGreen,
  },
  pressed: {
    transform: [{ scale: 0.99 }],
  },
});
