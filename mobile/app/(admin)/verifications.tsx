import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { ErrorState } from "../../components/states/ErrorState";
import { LoadingState } from "../../components/states/LoadingState";
import { AppButton } from "../../components/ui/AppButton";
import { Screen } from "../../components/ui/Screen";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { useLiveRefresh } from "../../hooks/useLiveRefresh";
import { listAdminVerifications } from "../../services/adminService";
import { AdminVerificationListItem } from "../../types/verification.types";
import { formatStatus } from "../../utils/formatStatus";

export default function AdminVerificationsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<AdminVerificationListItem[]>([]);
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

  const pendingCount = items.filter((item) => item.verification_status === "pending").length;

  return (
    <Screen title="Admin">
      <View style={styles.hero}>
        <StatusBadge label={`${pendingCount} pending`} tone={pendingCount > 0 ? "warning" : "success"} />
        <Text style={styles.title}>Driver verifications</Text>
        <Text style={styles.body}>Review manual driver identity and vehicle submissions.</Text>
      </View>

      {loading ? <LoadingState label="Loading verification queue..." /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error && items.map((item) => (
        <View key={item.driver_id} style={styles.card}>
          <StatusBadge label={formatStatus(item.verification_status)} tone={statusTone(item.verification_status)} />
          <Text style={styles.cardTitle}>{item.name || "Driver account"}</Text>
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
  if (status === "verified") return "success";
  if (status === "rejected") return "danger";
  if (status === "pending" || status === "needs_review") return "warning";
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
    backgroundColor: colors.surface,
    borderRadius: 22,
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
});
