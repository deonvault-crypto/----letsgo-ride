import { useCallback, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";

import { ErrorState } from "../../components/states/ErrorState";
import { LoadingState } from "../../components/states/LoadingState";
import { AppButton } from "../../components/ui/AppButton";
import { AppInput } from "../../components/ui/AppInput";
import { Screen } from "../../components/ui/Screen";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { useLiveRefresh } from "../../hooks/useLiveRefresh";
import {
  getMyVerification,
  submitManualVerification,
  uploadVerificationDocument,
} from "../../services/verificationService";
import {
  VerificationDocument,
  VerificationDocumentType,
  VerificationProfile,
} from "../../types/verification.types";
import { formatStatus } from "../../utils/formatStatus";
import { isPendingVerificationStatus, isVerifiedStatus, needsVerificationReview } from "../../utils/verificationStatus";

const manualDocumentTypes: VerificationDocumentType[] = [
  "selfie",
  "identity_document",
  "driver_license",
  "vehicle_registration_or_logbook",
  "vehicle_photo_optional",
];

const documentLabels: Partial<Record<VerificationDocumentType, string>> = {
  selfie: "Selfie photo",
  identity_document: "Identity document",
  driver_license: "Driver licence",
  vehicle_registration_or_logbook: "Vehicle registration or logbook",
  vehicle_photo_optional: "Vehicle photo optional",
};

export default function DriverVerificationScreen() {
  const [profile, setProfile] = useState<VerificationProfile | null>(null);
  const [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<VerificationDocumentType | null>(null);
  const [error, setError] = useState("");
  const hasLoaded = useRef(false);

  const load = useCallback(async () => {
    try {
      if (!hasLoaded.current) setLoading(true);
      setError("");
      setProfile(await getMyVerification());
      hasLoaded.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load verification.");
    } finally {
      setLoading(false);
    }
  }, []);

  useLiveRefresh(load, 15000);

  async function pickDocument(documentType: VerificationDocumentType) {
    try {
      setUploading(documentType);
      setError("");
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      await uploadVerificationDocument({
        documentType,
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to upload document.");
    } finally {
      setUploading(null);
    }
  }

  async function submit() {
    try {
      setSaving(true);
      setError("");
      const updated = await submitManualVerification({
        consent,
        verification_notes: notes,
      });
      setProfile(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit verification.");
    } finally {
      setSaving(false);
    }
  }

  const status = profile?.verification_status || "not_started";
  const uploadedDocuments = profile?.documents || [];
  const requiredDocuments = (profile?.required_documents || manualDocumentTypes).filter((item) => manualDocumentTypes.includes(item));
  const showManualForm =
    status === "not_started" ||
    status === "pending_uploads" ||
    status === "needs_review" ||
    status === "rejected" ||
    status === "needs_resubmission";
  const showSubmittedState = status !== "not_started";

  return (
    <Screen title="Driver verification" showBack fallbackRoute="/(shared)/profile" navRole="driver">
      <View style={styles.card}>
        <StatusBadge label={formatStatus(status)} tone={statusTone(status)} />
        <Text style={styles.title}>Driver verification</Text>
        <Text style={styles.body}>
          Verify your identity before posting public rides.
        </Text>
        <Text style={styles.body}>Upload your identity document, driver licence, selfie, and vehicle details. LetsGoRide checks your documents automatically and may request manual review if needed.</Text>
      </View>

      {loading ? <LoadingState label="Loading verification..." /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && status !== "not_started" ? <StatusCopy status={status} /> : null}

      {!loading && showSubmittedState ? (
        <SubmittedState status={status} documents={uploadedDocuments} />
      ) : null}

      {!loading && showManualForm ? (
        <>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Verification documents</Text>
            <Text style={styles.body}>Upload or replace any required documents to continue your driver verification.</Text>
            {requiredDocuments.map((documentType) => (
              <DocumentRow
                key={documentType}
                documentType={documentType}
                documents={uploadedDocuments}
                uploading={uploading === documentType}
                onUpload={() => pickDocument(documentType)}
              />
            ))}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Review notes</Text>
            <AppInput
              label="Message for verification team"
              value={notes}
              onChangeText={setNotes}
              placeholder="Add anything that helps review your documents"
              multiline
            />
            <Pressable
              accessibilityRole="checkbox"
              accessibilityLabel="Driver verification consent"
              accessibilityState={{ checked: consent }}
              style={styles.consentRow}
              onPress={() => setConsent((current) => !current)}
            >
              <View style={[styles.checkbox, consent && styles.checkboxOn]} />
              <Text style={styles.body}>
                I consent to LetsGoRide reviewing my identity and vehicle
                documents for driver verification, safety, and fraud
                prevention.
              </Text>
            </Pressable>
            <AppButton
              title={status === "not_started" ? "Submit for review" : "Resubmit for review"}
              loading={saving}
              disabled={!consent}
              onPress={submit}
            />
          </View>
        </>
      ) : null}
    </Screen>
  );
}

function DocumentRow({
  documentType,
  documents,
  uploading,
  onUpload,
}: {
  documentType: VerificationDocumentType;
  documents: VerificationDocument[];
  uploading: boolean;
  onUpload: () => void;
}) {
  const document = documents.find((item) => item.document_type === documentType);
  return (
    <View style={styles.documentRow}>
      <View style={styles.documentCopy}>
        <Text style={styles.documentTitle}>{documentLabels[documentType] || formatStatus(documentType)}</Text>
        <Text numberOfLines={1} style={styles.body}>
          {document ? `${document.file_name} - ${formatStatus(document.status || "pending")}` : "Not uploaded"}
        </Text>
      </View>
      <AppButton
        title={document ? "Replace" : "Upload"}
        variant="secondary"
        loading={uploading}
        onPress={onUpload}
        style={styles.smallButton}
      />
    </View>
  );
}

function SubmittedState({
  status,
  documents,
}: {
  status: VerificationProfile["verification_status"];
  documents: VerificationDocument[];
}) {
  const success = isVerifiedStatus(status);
  const rows = uploadedDocumentSummaryRows(documents);

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>
        {success ? "Driver verification approved" : "Verification submitted"}
      </Text>
      <Text style={styles.body}>
        {success
          ? "Your driver verification is approved. You can now post rides."
          : "Your documents have been submitted and are now under review. We will notify you when your driver verification is approved or if more information is needed."}
      </Text>
      {rows.length > 0 ? (
        <View style={styles.summaryCard}>
          <Text style={styles.documentTitle}>Submitted documents</Text>
          {rows.map((documentType) => {
            const document = documents.find((item) => item.document_type === documentType);
            return (
              <View key={documentType} style={styles.summaryRow}>
                <Text numberOfLines={1} style={styles.summaryLabel}>{documentLabels[documentType] || formatStatus(documentType)}</Text>
                <StatusBadge
                  label={document ? formatStatus(document.status || "pending") : documentType === "vehicle_photo_optional" ? "Optional" : "Pending"}
                  tone={document?.status === "accepted" ? "success" : document?.status === "rejected" ? "danger" : "warning"}
                />
              </View>
            );
          })}
        </View>
      ) : null}
      {!success ? (
        <Text style={styles.body}>
          Once approved, your profile will show a blue verified badge so
          passengers and drivers know your account has been reviewed by
          LetsGoRide.
        </Text>
      ) : null}
    </View>
  );
}

function StatusCopy({ status }: { status: VerificationProfile["verification_status"] }) {
  const copy = {
    pending_uploads: "Upload the remaining documents so LetsGoRide can review your driver verification.",
    pending_auto_check: "Your documents are being checked automatically.",
    needs_review: "We need more information. Please check the note and update your documents.",
    needs_resubmission: "Your verification requires a resubmission. Upload updated documents and submit again.",
    approved: "Your driver verification is approved.",
    rejected: "Your verification was not approved. Review the note or contact support.",
    not_started: "",
  }[status];

  if (!copy) return null;
  return (
    <View style={styles.notice}>
      <Text style={styles.body}>{copy}</Text>
    </View>
  );
}

function statusTone(status: VerificationProfile["verification_status"]): "success" | "warning" | "danger" | "neutral" {
  if (isVerifiedStatus(status)) return "success";
  if (status === "rejected") return "danger";
  if (isPendingVerificationStatus(status) || needsVerificationReview(status)) return "warning";
  return "neutral";
}

function uploadedDocumentSummaryRows(documents: VerificationDocument[]) {
  if (documents.length > 0) {
    return Array.from(new Set(documents.map((document) => document.document_type)));
  }
  return manualDocumentTypes;
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
  notice: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  title: {
    color: colors.whiteText,
    fontSize: 30,
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
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  documentCopy: {
    gap: 4,
  },
  documentTitle: {
    color: colors.whiteText,
    fontWeight: "900",
  },
  smallButton: {
    alignSelf: "flex-start",
    minHeight: 44,
  },
  summaryCard: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 20,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  summaryLabel: {
    flex: 1,
    color: colors.whiteText,
    fontWeight: "800",
  },
  consentRow: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "flex-start",
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 2,
  },
  checkboxOn: {
    backgroundColor: colors.primaryGreen,
    borderColor: colors.primaryGreen,
  },
});
