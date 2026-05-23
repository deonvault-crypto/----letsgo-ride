import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ErrorState } from "../../../components/states/ErrorState";
import { LoadingState } from "../../../components/states/LoadingState";
import { AppButton } from "../../../components/ui/AppButton";
import { AppInput } from "../../../components/ui/AppInput";
import { Screen } from "../../../components/ui/Screen";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { colors } from "../../../constants/colors";
import { spacing } from "../../../constants/spacing";
import { useLiveRefresh } from "../../../hooks/useLiveRefresh";
import {
  getAdminVerification,
  updateAdminVerificationStatus,
} from "../../../services/adminService";
import { AdminVerificationDetail, VerificationStatus } from "../../../types/verification.types";
import { formatStatus } from "../../../utils/formatStatus";

export default function AdminVerificationDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [detail, setDetail] = useState<AdminVerificationDetail | null>(null);
  const [notes, setNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<VerificationStatus | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError("");
      setDetail(await getAdminVerification(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load verification.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useLiveRefresh(load, 15000);

  async function updateStatus(status: Extract<VerificationStatus, "needs_review" | "verified" | "rejected">) {
    if (!id) return;
    try {
      setSaving(status);
      setError("");
      await updateAdminVerificationStatus({
        driverId: id,
        status,
        admin_verification_notes: notes,
        rejection_reason: rejectionReason,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update verification.");
    } finally {
      setSaving(null);
    }
  }

  async function updateDocument(documentId: string, documentStatus: "accepted" | "rejected") {
    if (!id) return;
    try {
      setError("");
      await updateAdminVerificationStatus({
        driverId: id,
        status: "needs_review",
        admin_verification_notes: notes,
        rejection_reason: rejectionReason,
        document_id: documentId,
        document_status: documentStatus,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update document.");
    }
  }

  if (loading) {
    return (
      <Screen title="Verification" showBack fallbackRoute="/(admin)/verifications">
        <LoadingState label="Loading verification..." />
      </Screen>
    );
  }

  const driver = detail?.driver || {};
  const status = String(driver.verification_status || "not_started") as VerificationStatus;

  return (
    <Screen title="Verification" showBack fallbackRoute="/(admin)/verifications">
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      <View style={styles.card}>
        <StatusBadge label={formatStatus(status)} tone={statusTone(status)} />
        <Text style={styles.title}>{String(driver.name || "Driver")}</Text>
        <Text style={styles.body}>{String(driver.phone || driver.email || "No contact on file")}</Text>
        <Text style={styles.body}>{String(driver.city || "City not set")}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Documents</Text>
        {(detail?.documents || []).map((document) => (
          <View key={document.id || document.file_name} style={styles.documentRow}>
            <Text style={styles.documentTitle}>{formatStatus(document.document_type)}</Text>
            <Text style={styles.body}>{document.file_name}</Text>
            <StatusBadge label={formatStatus(document.status || "pending")} tone={document.status === "rejected" ? "danger" : document.status === "accepted" ? "success" : "warning"} />
            {document.id ? (
              <View style={styles.documentActions}>
                <AppButton title="Accept document" variant="secondary" onPress={() => updateDocument(document.id as string, "accepted")} />
                <AppButton title="Reject document" variant="ghost" onPress={() => updateDocument(document.id as string, "rejected")} />
              </View>
            ) : null}
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Admin decision</Text>
        <AppInput
          label="Admin notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Decision notes for the verification record"
          multiline
        />
        <AppInput
          label="Rejection reason"
          value={rejectionReason}
          onChangeText={setRejectionReason}
          placeholder="Required when rejecting"
          multiline
        />
        <AppButton title="Approve verification" loading={saving === "verified"} onPress={() => updateStatus("verified")} />
        <AppButton title="Needs review" variant="secondary" loading={saving === "needs_review"} onPress={() => updateStatus("needs_review")} />
        <AppButton title="Reject verification" variant="danger" loading={saving === "rejected"} onPress={() => updateStatus("rejected")} />
      </View>
    </Screen>
  );
}

function statusTone(status: VerificationStatus): "success" | "warning" | "danger" | "neutral" {
  if (status === "verified") return "success";
  if (status === "rejected") return "danger";
  if (status === "pending" || status === "needs_review") return "warning";
  return "neutral";
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    color: colors.whiteText,
    fontSize: 28,
    fontWeight: "900",
  },
  sectionTitle: {
    color: colors.whiteText,
    fontSize: 18,
    fontWeight: "900",
  },
  body: {
    color: colors.mutedText,
    lineHeight: 22,
  },
  documentRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  documentTitle: {
    color: colors.whiteText,
    fontWeight: "900",
  },
  documentActions: {
    gap: spacing.sm,
  },
});
