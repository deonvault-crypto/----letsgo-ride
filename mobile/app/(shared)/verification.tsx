import { useCallback, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";

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
  selfie: "Selfie",
  identity_document: "Identity document",
  driver_license: "Driver licence",
  vehicle_registration_or_logbook: "Registration or logbook",
  vehicle_photo_optional: "Vehicle photo",
};

const documentDescriptions: Partial<Record<VerificationDocumentType, string>> = {
  selfie: "Use the front camera in good light so your face is clear.",
  identity_document: "Capture the photo page or national ID details clearly.",
  driver_license: "Scan the front of your valid driver licence.",
  vehicle_registration_or_logbook: "Capture the vehicle registration or logbook details.",
  vehicle_photo_optional: "Take a clear exterior photo of the vehicle passengers will see.",
};

const captureLabels: Partial<Record<VerificationDocumentType, string>> = {
  selfie: "Take selfie",
  identity_document: "Scan identity document",
  driver_license: "Scan driver licence",
  vehicle_registration_or_logbook: "Scan registration/logbook",
  vehicle_photo_optional: "Take vehicle photo",
};

export default function DriverVerificationScreen() {
  const [profile, setProfile] = useState<VerificationProfile | null>(null);
  const [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<VerificationDocumentType | null>(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const hasLoaded = useRef(false);

  const load = useCallback(async () => {
    try {
      if (!hasLoaded.current) setLoading(true);
      setLoadError("");
      const nextProfile = await getMyVerification();
      setProfile(nextProfile);
      setActionError("");
      hasLoaded.current = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load verification.";
      if (!hasLoaded.current) {
        setLoadError(message);
      } else {
        setActionError("Verification status could not refresh. Try again in a moment.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useLiveRefresh(load, 15000);

  async function captureDocument(documentType: VerificationDocumentType) {
    try {
      setUploading(documentType);
      setActionError("");
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        throw new Error("Camera permission is required to complete driver verification.");
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: documentType === "selfie" ? [1, 1] : [4, 3],
        cameraType: documentType === "selfie" ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
        mediaTypes: ["images"],
        quality: documentType === "selfie" ? 0.82 : 0.88,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const fallbackName = `${documentType}-${Date.now()}.jpg`;
      await uploadVerificationDocument({
        documentType,
        uri: asset.uri,
        name: asset.fileName || fallbackName,
        mimeType: asset.mimeType || "image/jpeg",
      });
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to capture document.");
    } finally {
      setUploading(null);
    }
  }

  async function submit() {
    try {
      setSaving(true);
      setActionError("");
      const updated = await submitManualVerification({
        consent,
        verification_notes: notes,
      });
      setProfile(updated);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to submit verification.");
    } finally {
      setSaving(false);
    }
  }

  const status = profile?.verification_status || "not_started";
  const uploadedDocuments = profile?.documents || [];
  const requiredDocuments = (profile?.required_documents || manualDocumentTypes).filter((item) => manualDocumentTypes.includes(item));
  const canRenderVerification = Boolean(profile && !loadError);
  const showManualForm = canRenderVerification && (
    status === "not_started" ||
    status === "pending_uploads" ||
    status === "needs_review" ||
    status === "rejected" ||
    status === "needs_resubmission"
  );
  const showSubmittedState = status === "pending_auto_check" || status === "approved";

  return (
    <Screen title="Driver verification" showBack fallbackRoute="/(shared)/profile" navRole="driver">
      {loading ? <LoadingState label="Loading verification..." /> : null}
      {!loading && loadError ? <ErrorState message={loadError} onRetry={load} /> : null}

      {canRenderVerification ? (
        <View style={styles.card}>
          <StatusBadge label={formatStatus(status)} tone={statusTone(status)} />
          <Text style={styles.title}>Driver verification</Text>
          <Text style={styles.body}>
            Complete a camera-based identity check before posting public rides.
          </Text>
          <Text style={styles.body}>
            LetsGoRide uses live capture for your selfie, identity document, driver licence, and vehicle record. If automated checks need help, the same captured documents move to manual review.
          </Text>
        </View>
      ) : null}

      {canRenderVerification && status !== "not_started" ? <StatusCopy status={status} /> : null}

      {canRenderVerification && showSubmittedState ? (
        <SubmittedState status={status} documents={uploadedDocuments} />
      ) : null}

      {canRenderVerification && showManualForm ? (
        <>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Capture documents</Text>
            <Text style={styles.body}>Use the camera for each check. Make sure names, faces, licence numbers, and vehicle details are sharp and readable.</Text>
            {requiredDocuments.map((documentType) => (
              <DocumentRow
                key={documentType}
                documentType={documentType}
                documents={uploadedDocuments}
                uploading={uploading === documentType}
                onCapture={() => captureDocument(documentType)}
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
            {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}
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
  onCapture,
}: {
  documentType: VerificationDocumentType;
  documents: VerificationDocument[];
  uploading: boolean;
  onCapture: () => void;
}) {
  const document = findLatestDocument(documents, documentType);
  const required = documentType !== "vehicle_photo_optional";
  return (
    <View style={styles.documentRow}>
      <View style={styles.documentCopy}>
        <Text style={styles.documentTitle}>
          {documentLabels[documentType] || formatStatus(documentType)}
          {required ? "" : " (optional)"}
        </Text>
        <Text style={styles.body}>{documentDescriptions[documentType]}</Text>
        <Text numberOfLines={1} style={styles.body}>
          {document ? `${document.file_name || "Captured document"} - ${formatStatus(document.status || "pending")}` : "Not captured"}
        </Text>
      </View>
      <AppButton
        title={captureLabels[documentType] || "Capture document"}
        variant="secondary"
        loading={uploading}
        onPress={onCapture}
        icon={<MaterialCommunityIcons name="camera-outline" size={18} color={colors.whiteText} />}
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
            const document = findLatestDocument(documents, documentType);
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

function findLatestDocument(documents: VerificationDocument[], documentType: VerificationDocumentType) {
  return [...documents].reverse().find((item) => item.document_type === documentType);
}

function StatusCopy({ status }: { status: VerificationProfile["verification_status"] }) {
  const copy = {
    pending_uploads: "Capture the remaining documents so LetsGoRide can review your driver verification.",
    pending_auto_check: "Your documents are being checked automatically.",
    needs_review: "We need more information. Please check the note and update your documents.",
    needs_resubmission: "Your verification requires a resubmission. Capture updated documents and submit again.",
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
  errorText: {
    color: colors.danger,
    fontWeight: "800",
    lineHeight: 20,
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
