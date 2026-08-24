import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { LoadingState } from "../../components/states/LoadingState";
import { AppNotice } from "../../components/ui/AppNotice";
import { Screen } from "../../components/ui/Screen";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { COURIER_VEHICLE_TYPES, DRIVER_VEHICLE_TYPES, findServiceArea, ZIMBABWE_SERVICE_AREAS } from "../../constants/zimbabweOperations";
import { v2Theme } from "../../constants/v2Theme";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { listMyWorkerApplications, saveWorkerApplication, submitWorkerApplication, uploadWorkerApplicationDocument } from "../../services/operationsService";
import { WorkerApplication, WorkerApplicationDocumentType, WorkerProduct } from "../../types/operations.types";

type ViewMode = "edit" | "summary" | "review";

const documentLabels: Record<WorkerApplicationDocumentType, string> = {
  identity_document: "Identity document",
  selfie: "Live selfie",
  driver_licence: "Driver licence",
  vehicle_registration: "Vehicle registration",
  business_registration: "Business registration",
};

export default function WorkerApplicationScreen() {
  const params = useLocalSearchParams<{ product?: string }>();
  const product: WorkerProduct = params.product === "driver" ? "driver" : params.product === "merchant" ? "merchant" : "courier";
  const { user } = useCurrentUser();
  const [application, setApplication] = useState<WorkerApplication | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("edit");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [serviceAreaId, setServiceAreaId] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [vehicleDetails, setVehicleDetails] = useState("");
  const [experience, setExperience] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [registration, setRegistration] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<WorkerApplicationDocumentType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hydrate = useCallback((item: WorkerApplication | null, mode?: ViewMode) => {
    setApplication(item);
    if (!item) {
      if (mode) setViewMode(mode);
      return;
    }
    setFullName(item.full_name);
    setPhone(item.phone);
    setServiceAreaId(item.service_area_id || findServiceArea(item.service_area)?.id || "");
    setVehicleType(item.vehicle_type || "");
    setVehicleDetails(item.vehicle_details || "");
    setExperience(item.experience || "");
    setBusinessName(item.business_name || "");
    setBusinessAddress(item.business_address || "");
    setRegistration(item.business_registration_number || "");
    setAccepted(item.accepted_terms);
    setViewMode(mode || "summary");
  }, []);

  const load = useCallback(async () => {
    try {
      setError(null);
      const items = await listMyWorkerApplications();
      const item = items.find((candidate) => candidate.product === product) || null;
      hydrate(item, item ? "summary" : "edit");
      if (!item) {
        setFullName((value) => value || user?.name || "");
        setPhone((value) => value || user?.phone || "");
        setServiceAreaId((value) => value || findServiceArea(user?.city)?.id || "");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load application.");
    } finally {
      setLoading(false);
    }
  }, [hydrate, product, user?.city, user?.name, user?.phone]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const serverCanEdit = !application || ["DRAFT", "REJECTED"].includes(application.status);
  const detailsComplete = Boolean(
    accepted && fullName.trim() && phone.trim() && serviceAreaId
      && (product === "merchant" ? businessName.trim() && businessAddress.trim() && registration.trim() : vehicleType),
  );
  const readyForReview = Boolean(application && application.missing_document_types.length === 0 && application.accepted_terms);

  async function save() {
    try {
      setBusy(true);
      setError(null);
      const area = ZIMBABWE_SERVICE_AREAS.find((item) => item.id === serviceAreaId);
      if (!area) throw new Error("Choose your working city.");
      const saved = await saveWorkerApplication({
        product,
        full_name: fullName.trim(),
        phone: phone.trim(),
        service_area: area.name,
        service_area_id: area.id,
        vehicle: null,
        vehicle_type: product === "merchant" ? null : vehicleType,
        vehicle_details: product === "merchant" ? null : vehicleDetails.trim() || null,
        experience: experience.trim() || null,
        business_name: product === "merchant" ? businessName.trim() : null,
        business_address: product === "merchant" ? businessAddress.trim() : null,
        business_registration_number: product === "merchant" ? registration.trim() : null,
        accepted_terms: accepted,
      });
      const confirmed = (await listMyWorkerApplications()).find((item) => item.id === saved.id);
      if (!confirmed) throw new Error("Your application was saved but could not be confirmed. Please try again.");
      hydrate(confirmed, "summary");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save application.");
    } finally {
      setBusy(false);
    }
  }

  async function capture(documentType: WorkerApplicationDocumentType) {
    if (!application || !serverCanEdit) return;
    try {
      setError(null);
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) throw new Error("Camera permission is required for reviewed application documents.");
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: documentType === "selfie" ? [1, 1] : [4, 3],
        cameraType: documentType === "selfie" ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
        mediaTypes: ["images"],
        quality: 0.86,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      setUploading(documentType);
      const item = await uploadWorkerApplicationDocument({
        applicationId: application.id,
        documentType,
        uri: asset.uri,
        name: asset.fileName || `${documentType}-${Date.now()}.jpg`,
        mimeType: asset.mimeType,
      });
      hydrate(item, "summary");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Document upload failed.");
    } finally {
      setUploading(null);
    }
  }

  async function submit() {
    if (!application || !readyForReview) return;
    try {
      setBusy(true);
      setError(null);
      hydrate(await submitWorkerApplication(application.id), "summary");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit application.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Screen title={title(product)} showBack fallbackRoute="/(shared)/work-with-us"><LoadingState label="Loading your application…" /></Screen>;

  const vehicleOptions = product === "driver" ? DRIVER_VEHICLE_TYPES : COURIER_VEHICLE_TYPES;
  const locked = Boolean(application && !serverCanEdit);

  return (
    <Screen title={title(product)} showBack fallbackRoute="/(shared)/work-with-us">
      <ApplicationHero application={application} product={product} />
      <AppNotice message={error} actionLabel="Retry" onAction={load} onDismiss={() => setError(null)} />
      {application?.review_note ? <View style={styles.reviewNote}><Text style={styles.reviewTitle}>Changes requested</Text><Text style={styles.body}>{application.review_note}</Text></View> : null}

      {viewMode === "edit" && serverCanEdit ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{application ? "Edit details" : "Your details"}</Text>
          <Field label="Full legal name" value={fullName} onChangeText={setFullName} />
          <Field label="Phone" value={phone} onChangeText={setPhone} />
          <SearchableSelect label={product === "merchant" ? "Business city" : "Working city"} value={serviceAreaId} options={ZIMBABWE_SERVICE_AREAS} placeholder="Choose a city" onSelect={(option) => setServiceAreaId(option.id)} />
          {product !== "merchant" ? <><SearchableSelect label="Vehicle type" value={vehicleType} options={vehicleOptions} placeholder="Choose vehicle type" onSelect={(option) => setVehicleType(option.id)} /><Field label="Vehicle make, model and registration (optional)" value={vehicleDetails} onChangeText={setVehicleDetails} /></> : null}
          <Field label="Experience (optional)" value={experience} onChangeText={setExperience} multiline />
          {product === "merchant" ? <><Field label="Business name" value={businessName} onChangeText={setBusinessName} /><Field label="Business address" value={businessAddress} onChangeText={setBusinessAddress} /><Field label="Business registration number" value={registration} onChangeText={setRegistration} /></> : null}
          <Declaration checked={accepted} onPress={() => setAccepted((value) => !value)} />
          <View style={styles.buttonRow}>
            {application ? <Pressable accessibilityRole="button" onPress={() => { hydrate(application, "summary"); setError(null); }} style={styles.secondaryButton}><Text style={styles.secondaryText}>Cancel</Text></Pressable> : null}
            <Pressable accessibilityRole="button" disabled={busy || !detailsComplete} onPress={save} style={[styles.primaryButton, (busy || !detailsComplete) && styles.disabled]}><Text style={styles.primaryText}>{busy ? "Saving…" : "Save application"}</Text></Pressable>
          </View>
        </View>
      ) : null}

      {application && viewMode !== "edit" ? <ApplicationSummary application={application} product={product} review={viewMode === "review"} /> : null}
      {application && viewMode !== "edit" ? <DocumentsSection application={application} canReplace={serverCanEdit && viewMode === "summary"} uploading={uploading} onCapture={capture} /> : null}

      {application && viewMode === "summary" && serverCanEdit ? (
        <View style={styles.actionsCard}>
          <Pressable accessibilityRole="button" onPress={() => setViewMode("edit")} style={styles.secondaryWide}><MaterialCommunityIcons name="pencil-outline" size={19} color={v2Theme.colors.ink} /><Text style={styles.secondaryWideText}>Edit details</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={!readyForReview} onPress={() => setViewMode("review")} style={[styles.reviewButton, !readyForReview && styles.disabled]}><Text style={styles.reviewButtonText}>Review application</Text><MaterialCommunityIcons name="arrow-right" size={20} color="#FFFFFF" /></Pressable>
          {!readyForReview ? <Text style={styles.requirementHelp}>Add every required document before final review.</Text> : null}
        </View>
      ) : null}

      {application && viewMode === "review" && serverCanEdit ? (
        <View style={styles.actionsCard}>
          <Text style={styles.declarationSaved}>Declaration accepted</Text>
          <Text style={styles.body}>By submitting, you confirm the saved information and documents are current and may be reviewed for identity, safety and fraud prevention.</Text>
          <Pressable accessibilityRole="button" disabled={busy || !readyForReview} onPress={submit} style={[styles.submitButton, (busy || !readyForReview) && styles.disabled]}><Text style={styles.submitText}>{busy ? "Submitting…" : "Submit application"}</Text><MaterialCommunityIcons name="shield-check-outline" size={20} color="#FFFFFF" /></Pressable>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => setViewMode("summary")} style={styles.backToDraft}><Text style={styles.backToDraftText}>Back to saved draft</Text></Pressable>
        </View>
      ) : null}

      {locked ? <View style={styles.lockedNote}><MaterialCommunityIcons name="lock-outline" size={20} color={v2Theme.colors.brandStrong} /><Text style={styles.lockedText}>This application is read-only while its current review status is active.</Text></View> : null}
    </Screen>
  );
}

function ApplicationHero({ application, product }: { application: WorkerApplication | null; product: WorkerProduct }) {
  const status = application?.status;
  const heading = status === "SUBMITTED" || status === "UNDER_REVIEW" ? "Application submitted" : status === "APPROVED" ? "Application approved" : status === "REJECTED" ? "Update your application" : application ? "Saved draft" : "Build your application";
  return <View style={styles.hero}><Text style={styles.eyebrow}>{title(product)}</Text><Text style={styles.heroTitle}>{heading}</Text><Text style={styles.heroBody}>{statusCopy(status)}</Text>{application ? <View style={styles.statusRow}><Text style={styles.statusLabel}>Status</Text><Text style={styles.statusValue}>{displayStatus(status)}</Text></View> : null}</View>;
}

function ApplicationSummary({ application, product, review }: { application: WorkerApplication; product: WorkerProduct; review: boolean }) {
  return <View style={styles.card} accessibilityLabel={review ? "Application review" : "Saved application summary"}>
    <Text style={styles.sectionTitle}>{review ? "Review application" : product === "merchant" ? "Business details" : "Saved details"}</Text>
    {product === "merchant" ? <><SummaryRow label="Business" value={application.business_name || "Not added"} /><SummaryRow label="City" value={application.service_area} /><SummaryRow label="Address" value={application.business_address || "Not added"} /><SummaryRow label="Registration" value={application.business_registration_number || "Not added"} /></> : <><SummaryRow label="Working city" value={application.service_area} /><SummaryRow label="Vehicle" value={application.vehicle || application.vehicle_type || "Not added"} /></>}
    <View style={styles.divider} />
    <Text style={styles.summaryGroup}>Applicant</Text>
    <SummaryRow label="Name" value={application.full_name} />
    <SummaryRow label="Phone" value={application.phone} />
    {application.experience ? <SummaryRow label="Experience" value={application.experience} /> : null}
  </View>;
}

function DocumentsSection({ application, canReplace, uploading, onCapture }: { application: WorkerApplication; canReplace: boolean; uploading: WorkerApplicationDocumentType | null; onCapture: (type: WorkerApplicationDocumentType) => void }) {
  return <View style={styles.card}><Text style={styles.sectionTitle}>Required documents</Text>{application.required_document_types.map((type) => { const uploaded = application.documents.find((item) => item.document_type === type); return <View key={type} style={styles.document}><View style={[styles.documentIcon, uploaded ? styles.documentIconDone : styles.documentIconMissing]}><MaterialCommunityIcons name={uploaded ? "check" : "file-alert-outline"} size={20} color={uploaded ? "#FFFFFF" : v2Theme.colors.warning} /></View><View style={styles.flex}><Text style={styles.documentTitle}>{documentLabels[type]}</Text><Text style={styles.documentState}>{uploaded ? `Uploaded. ${naturalCase(uploaded.status)}` : "Required before submission"}</Text></View>{canReplace ? <Pressable accessibilityRole="button" disabled={Boolean(uploading)} onPress={() => onCapture(type)} style={styles.capture}><Text style={styles.captureText}>{uploading === type ? "Uploading…" : uploaded ? "Replace" : "Capture"}</Text></Pressable> : null}</View>; })}</View>;
}

function SummaryRow({ label, value }: { label: string; value: string }) { return <View style={styles.summaryRow}><Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryValue}>{value}</Text></View>; }
function Field({ label, value, onChangeText, multiline }: { label: string; value: string; onChangeText: (value: string) => void; multiline?: boolean }) { return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} multiline={multiline} style={[styles.input, multiline && styles.multiline]} /></View>; }
function Declaration({ checked, onPress }: { checked: boolean; onPress: () => void }) { return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={onPress} style={styles.consent}><View style={[styles.checkbox, checked && styles.checkboxOn]}>{checked ? <MaterialCommunityIcons name="check" size={15} color="#FFFFFF" /> : null}</View><Text style={styles.consentText}>I confirm these details are mine and consent to LetsGoRide reviewing them for identity, safety and fraud prevention.</Text></Pressable>; }
function title(product: WorkerProduct) { return product === "courier" ? "Apply to deliver" : product === "driver" ? "Become a Driver" : "Partner with LetsGoRide"; }
function naturalCase(value: string) { return value.replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, (char) => char.toUpperCase()); }
function displayStatus(status?: string) { if (status === "SUBMITTED" || status === "UNDER_REVIEW") return "Under review"; if (status === "DRAFT") return "Saved draft"; return status ? naturalCase(status) : "Not started"; }
function statusCopy(status?: string) { if (status === "SUBMITTED" || status === "UNDER_REVIEW") return "We’ve received your application and will notify you after review."; if (status === "APPROVED") return "Your application has been approved. Sign in again to get started."; if (status === "REJECTED") return "Review the requested changes, update your details and submit again when ready."; if (status === "DRAFT") return "Your details are saved. Add the required documents, then review everything before submitting."; return "Add your details and required documents, then submit when you’re ready."; }

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { borderRadius: 26, backgroundColor: v2Theme.colors.brandSofter, padding: 18, gap: 7, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.brandSoft },
  eyebrow: { color: v2Theme.colors.brandStrong, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  heroTitle: { color: v2Theme.colors.ink, fontSize: 27, fontWeight: "900", letterSpacing: -0.7 },
  heroBody: { color: v2Theme.colors.inkSecondary, fontSize: 11, lineHeight: 17 },
  statusRow: { marginTop: 5, paddingTop: 11, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: v2Theme.colors.brandSoft, flexDirection: "row", justifyContent: "space-between", gap: 12 },
  statusLabel: { color: v2Theme.colors.inkSecondary, fontSize: 10, fontWeight: "700" },
  statusValue: { color: v2Theme.colors.brandStrong, fontSize: 10, fontWeight: "900" },
  card: { borderRadius: 24, backgroundColor: v2Theme.colors.surface, padding: 15, gap: 11, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line },
  sectionTitle: { color: v2Theme.colors.ink, fontSize: 18, fontWeight: "900" },
  body: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 16 },
  field: { gap: 5 },
  label: { color: v2Theme.colors.inkSecondary, fontSize: 9, fontWeight: "800" },
  input: { minHeight: 48, borderRadius: 14, backgroundColor: v2Theme.colors.surfaceMuted, paddingHorizontal: 12, color: v2Theme.colors.ink, fontSize: 12, fontWeight: "700" },
  multiline: { minHeight: 78, paddingTop: 11, textAlignVertical: "top" },
  consent: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  checkbox: { width: 22, height: 22, borderRadius: 7, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  checkboxOn: { backgroundColor: v2Theme.colors.brand },
  consentText: { flex: 1, color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14 },
  buttonRow: { flexDirection: "row", gap: 9 },
  primaryButton: { flex: 1, minHeight: 50, borderRadius: 15, backgroundColor: v2Theme.colors.brand, alignItems: "center", justifyContent: "center" },
  primaryText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  secondaryButton: { minWidth: 90, minHeight: 50, borderRadius: 15, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: v2Theme.colors.ink, fontSize: 10, fontWeight: "900" },
  summaryGroup: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900" },
  summaryRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  summaryLabel: { width: 86, color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 16 },
  summaryValue: { flex: 1, color: v2Theme.colors.ink, fontSize: 11, lineHeight: 16, fontWeight: "800" },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: v2Theme.colors.line },
  document: { minHeight: 63, borderRadius: 17, backgroundColor: v2Theme.colors.surfaceMuted, padding: 10, flexDirection: "row", alignItems: "center", gap: 9 },
  documentIcon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  documentIconDone: { backgroundColor: v2Theme.colors.brand },
  documentIconMissing: { backgroundColor: v2Theme.colors.warningSoft },
  documentTitle: { color: v2Theme.colors.ink, fontSize: 10, fontWeight: "900" },
  documentState: { color: v2Theme.colors.inkSecondary, fontSize: 8, marginTop: 2 },
  capture: { borderRadius: 12, backgroundColor: v2Theme.colors.surface, paddingHorizontal: 10, paddingVertical: 9 },
  captureText: { color: v2Theme.colors.ink, fontSize: 8, fontWeight: "900" },
  actionsCard: { borderRadius: 22, backgroundColor: v2Theme.colors.surfaceMuted, padding: 13, gap: 9 },
  secondaryWide: { minHeight: 48, borderRadius: 15, backgroundColor: v2Theme.colors.surface, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  secondaryWideText: { color: v2Theme.colors.ink, fontSize: 10, fontWeight: "900" },
  reviewButton: { minHeight: 51, borderRadius: 15, backgroundColor: v2Theme.colors.brand, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  reviewButtonText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  requirementHelp: { color: v2Theme.colors.inkSecondary, fontSize: 9, textAlign: "center" },
  declarationSaved: { color: v2Theme.colors.brandStrong, fontSize: 11, fontWeight: "900" },
  submitButton: { minHeight: 52, borderRadius: 15, backgroundColor: v2Theme.colors.ink, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  submitText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  backToDraft: { minHeight: 42, alignItems: "center", justifyContent: "center" },
  backToDraftText: { color: v2Theme.colors.inkSecondary, fontSize: 10, fontWeight: "800" },
  lockedNote: { borderRadius: 19, backgroundColor: v2Theme.colors.brandSofter, padding: 13, flexDirection: "row", gap: 9 },
  lockedText: { flex: 1, color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14 },
  reviewNote: { borderRadius: 20, backgroundColor: v2Theme.colors.warningSoft, padding: 13, gap: 4 },
  reviewTitle: { color: v2Theme.colors.warning, fontSize: 11, fontWeight: "900" },
  disabled: { opacity: 0.42 },
});
