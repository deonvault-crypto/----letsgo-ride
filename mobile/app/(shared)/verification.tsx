import { useCallback, useState } from "react";
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

const documentLabels: Record<VerificationDocumentType, string> = {
  identity_document: "Identity document",
  driver_license: "Driver license",
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

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      setProfile(await getMyVerification());
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
  const requiredDocuments = profile?.required_documents || (Object.keys(documentLabels) as VerificationDocumentType[]);

  return (
    <Screen title="Verification" navRole="driver">
      <View style={styles.card}>
        <StatusBadge label={formatStatus(status)} tone={statusTone(status)} />
        <Text style={styles.title}>Driver verification</Text>
        <Text style={styles.body}>
          Before posting rides, we need to verify your identity and vehicle
          details. This helps protect passengers and keeps LetsGo Ride safer.
        </Text>
      </View>

      {loading ? <LoadingState label="Loading verification..." /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && status !== "not_started" ? <StatusCopy status={status} /> : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Required documents</Text>
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
        <Pressable style={styles.consentRow} onPress={() => setConsent((current) => !current)}>
          <View style={[styles.checkbox, consent && styles.checkboxOn]} />
          <Text style={styles.body}>
            I consent to LetsGo Ride reviewing my identity and vehicle documents
            for driver verification, safety, and fraud prevention.
          </Text>
        </Pressable>
        <AppButton
          title="Submit for review"
          loading={saving}
          disabled={!consent}
          onPress={submit}
        />
      </View>
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
        <Text style={styles.documentTitle}>{documentLabels[documentType]}</Text>
        <Text style={styles.body}>
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

function StatusCopy({ status }: { status: VerificationProfile["verification_status"] }) {
  const copy = {
    pending: "Your verification is under review.",
    needs_review: "We need more information. Please check the note and update your documents.",
    verified: "Your driver verification is approved.",
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
