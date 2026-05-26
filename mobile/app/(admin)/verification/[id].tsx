import { useCallback, useState } from "react";
import { Image, Linking, Modal, StyleSheet, Text, View } from "react-native";
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
  getAdminDocumentUrl,
  updateAdminVerificationStatus,
} from "../../../services/adminService";
import { AdminVerificationDetail, VerificationStatus } from "../../../types/verification.types";
import { formatStatus } from "../../../utils/formatStatus";
import { isPendingVerificationStatus, isVerifiedStatus, needsVerificationReview } from "../../../utils/verificationStatus";

export default function AdminVerificationDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [detail, setDetail] = useState<AdminVerificationDetail | null>(null);
  const [notes, setNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<VerificationStatus | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
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
    if (status === "rejected" && !rejectionReason.trim()) {
      setError("Rejection reason is required.");
      return;
    }
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
    if (documentStatus === "rejected" && !rejectionReason.trim()) {
      setError("Rejection reason is required.");
      return;
    }
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

  async function viewDocument(documentId: string, fileName?: string, contentType?: string | null) {
    if (!id) return;
    const url = await getAdminDocumentUrl(id, documentId);
    const isImage = Boolean(contentType?.startsWith("image/")) || /\.(png|jpe?g|webp|gif)$/i.test(fileName || "");
    if (isImage) {
      setPreviewUrl(url);
      return;
    }
    await Linking.openURL(url);
  }

  if (loading) {
    return (
      <Screen title="Verification" showBack fallbackRoute="/(admin)/verifications">
        <LoadingState label="Loading verification..." />
      </Screen>
    );
  }

  if (error && !detail) {
    return (
      <Screen title="Verification" showBack fallbackRoute="/(admin)/verifications">
        <ErrorState message={friendlyVerificationError(error)} onRetry={load} />
      </Screen>
    );
  }

  const driver = detail?.driver || {};
  const status = String(driver.verification_status || "not_started") as VerificationStatus;

  return (
    <Screen title="Verification" showBack fallbackRoute="/(admin)/verifications">
      <Modal transparent visible={Boolean(previewUrl)} animationType="fade" onRequestClose={() => setPreviewUrl("")}>
        <View style={styles.previewBackdrop}>
          <View style={styles.previewCard}>
            <Image source={{ uri: previewUrl }} style={styles.previewImage} resizeMode="contain" />
            <AppButton title="Close document" variant="secondary" onPress={() => setPreviewUrl("")} />
          </View>
        </View>
      </Modal>
      {error ? <ErrorState message={friendlyVerificationError(error)} onRetry={load} /> : null}
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
            <Text numberOfLines={1} style={styles.body}>{decodeFileName(document.file_name)}</Text>
            <StatusBadge label={formatStatus(document.status || "pending")} tone={document.status === "rejected" ? "danger" : document.status === "accepted" ? "success" : "warning"} />
            {document.id ? (
              <View style={styles.documentActions}>
                <AppButton title="View document" onPress={() => viewDocument(document.id as string, document.file_name, document.content_type)} />
                <AppButton title="Accept document" variant="secondary" disabled={Boolean(saving)} onPress={() => updateDocument(document.id as string, "accepted")} />
                <AppButton title="Reject document" variant="ghost" disabled={Boolean(saving)} onPress={() => updateDocument(document.id as string, "rejected")} />
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
        <AppButton title="Approve verification" loading={saving === "verified"} disabled={!detail || Boolean(saving)} onPress={() => updateStatus("verified")} />
        <AppButton title="Needs review" variant="secondary" loading={saving === "needs_review"} disabled={!detail || Boolean(saving)} onPress={() => updateStatus("needs_review")} />
        <AppButton title="Reject verification" variant="danger" loading={saving === "rejected"} disabled={!detail || Boolean(saving)} onPress={() => updateStatus("rejected")} />
      </View>
    </Screen>
  );
}

function decodeFileName(fileName: string) {
  try {
    return decodeURIComponent(fileName);
  } catch {
    return fileName;
  }
}

function friendlyVerificationError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("admin access")) return "Admin access required. Please log in again.";
  if (lower.includes("not found")) return "Verification record not found.";
  return "Could not load verification details. Please try again.";
}

function statusTone(status: VerificationStatus): "success" | "warning" | "danger" | "neutral" {
  if (isVerifiedStatus(status)) return "success";
  if (status === "rejected") return "danger";
  if (isPendingVerificationStatus(status) || needsVerificationReview(status)) return "warning";
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
  previewBackdrop: {
    flex: 1,
    backgroundColor: "rgba(17,20,23,0.42)",
    justifyContent: "center",
    padding: spacing.lg,
  },
  previewCard: {
    height: "78%",
    borderRadius: 26,
    backgroundColor: colors.appBackground,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  previewImage: {
    flex: 1,
    width: "100%",
  },
});
