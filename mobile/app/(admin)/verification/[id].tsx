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
import { useScreenReconciliation } from "../../../hooks/useScreenReconciliation";
import {
  getAdminVerification,
  getAdminDocumentUrl,
  updateAdminVerificationStatus,
} from "../../../services/adminService";
import { AdminVerificationDetail, VerificationDocument, VerificationStatus } from "../../../types/verification.types";
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

  useScreenReconciliation(load);

  async function updateStatus(status: Extract<VerificationStatus, "needs_review" | "approved" | "rejected" | "needs_resubmission">) {
    if (!id) return;
    if (status === "rejected" && !rejectionReason.trim()) {
      setError("Rejection reason is required.");
      return;
    }
    try {
      setSaving(status);
      setError("");
      const updated = await updateAdminVerificationStatus({
        driverId: id,
        status,
        admin_verification_notes: notes,
        rejection_reason: rejectionReason,
      });
      applyUpdatedDriver(updated);
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
      const updated = await updateAdminVerificationStatus({
        driverId: id,
        status: "needs_review",
        admin_verification_notes: notes,
        rejection_reason: rejectionReason,
        document_id: documentId,
        document_status: documentStatus,
      });
      applyUpdatedDriver(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update document.");
    }
  }

  function applyUpdatedDriver(updated: Record<string, unknown>) {
    setDetail((current) => current ? {
      ...current,
      driver: { ...current.driver, ...updated },
      documents: Array.isArray(updated.documents) ? updated.documents as VerificationDocument[] : current.documents,
    } : current);
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
    <Screen title="Verification" showBack fallbackRoute="/(admin)/verifications" refreshing={loading} onRefresh={load}>
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
        <Text style={styles.sectionTitle}>Verification intelligence</Text>
        <MetricRow label="Risk level" value={formatStatus(String(driver.risk_level || "low"))} />
        <MetricRow label="Risk score" value={formatRiskScore(driver.risk_score ?? driver.verification_risk_score)} />
        <MetricRow label="Face match" value={formatStatus(String(driver.face_match_status || "not_required"))} />
        <MetricRow label="OCR provider" value={formatStatus(String(driver.ocr_provider || "disabled"))} />
        <MetricRow label="OCR confidence" value={formatRiskScore(driver.ocr_confidence)} />
        <MetricRow label="Face duplicate check" value={formatStatus(String(driver.face_embedding_duplicate_status || "not_implemented"))} />
        <FlagList title="Review reasons" values={arrayOfStrings(driver.review_reasons)} emptyLabel="No review reasons recorded." />
        <FlagList title="Duplicate flags" values={arrayOfStrings(driver.duplicate_flags)} emptyLabel="No duplicate flags detected." />
        <FlagList title="Risk flags" values={arrayOfStrings(driver.risk_flags || driver.verification_risk_flags)} emptyLabel="No risk flags detected." />
        {driver.face_match_reason ? <Text style={styles.body}>{String(driver.face_match_reason)}</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Extracted fields</Text>
        {objectEntries(driver.ocr_extracted_fields).length ? (
          objectEntries(driver.ocr_extracted_fields).map(([key, value]) => (
            <MetricRow key={key} label={formatStatus(key)} value={String(value)} />
          ))
        ) : (
          <Text style={styles.body}>No OCR fields extracted.</Text>
        )}
        <MetricRow label="Liveness challenge" value={driver.challenge_code ? String(driver.challenge_code) : "Not generated"} />
        <MetricRow label="Challenge created" value={driver.challenge_created_at ? String(driver.challenge_created_at) : "Not generated"} />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Documents</Text>
        {(detail?.documents || []).map((document) => (
          <View key={document.id || document.file_name} style={styles.documentRow}>
            <Text style={styles.documentTitle}>{formatStatus(document.document_type)}</Text>
            <Text numberOfLines={1} style={styles.body}>{decodeFileName(document.file_name)}</Text>
            <StatusBadge label={formatStatus(document.status || "pending")} tone={document.status === "rejected" ? "danger" : document.status === "accepted" ? "success" : "warning"} />
            {document.ocr ? (
              <Text style={styles.body}>
                OCR: {formatStatus(document.ocr.status)} - {Math.round((document.ocr.confidence || 0) * 100)}%
              </Text>
            ) : null}
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
        <AppButton title="Approve verification" loading={saving === "approved"} disabled={!detail || Boolean(saving)} onPress={() => updateStatus("approved")} />
        <AppButton title="Needs review" variant="secondary" loading={saving === "needs_review"} disabled={!detail || Boolean(saving)} onPress={() => updateStatus("needs_review")} />
        <AppButton title="Request resubmission" variant="secondary" loading={saving === "needs_resubmission"} disabled={!detail || Boolean(saving)} onPress={() => updateStatus("needs_resubmission")} />
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

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function FlagList({ title, values, emptyLabel }: { title: string; values: string[]; emptyLabel: string }) {
  return (
    <View style={styles.flagGroup}>
      <Text style={styles.documentTitle}>{title}</Text>
      {values.length ? (
        <View style={styles.flagWrap}>
          {values.map((value) => (
            <View key={value} style={styles.flagPill}>
              <Text style={styles.flagText}>{formatStatus(value)}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.body}>{emptyLabel}</Text>
      )}
    </View>
  );
}

function arrayOfStrings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function objectEntries(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== null && item !== undefined && item !== "");
}

function formatRiskScore(value: unknown) {
  const score = typeof value === "number" ? value : Number(value || 0);
  if (!Number.isFinite(score)) return "0%";
  return `${Math.round(score * 100)}%`;
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
  metricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  metricLabel: {
    flex: 1,
    color: colors.mutedText,
    lineHeight: 20,
  },
  metricValue: {
    flex: 1,
    color: colors.whiteText,
    fontWeight: "800",
    lineHeight: 20,
    textAlign: "right",
  },
  flagGroup: {
    gap: spacing.sm,
  },
  flagWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  flagPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  flagText: {
    color: colors.whiteText,
    fontWeight: "800",
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
