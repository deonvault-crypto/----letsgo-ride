import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert, Linking, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { LoadingState } from "../../components/states/LoadingState";
import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";
import { cancelCourierDelivery } from "../../services/courierService";
import {
  createAdminCourierShift,
  listAdminCourierDeliveries,
  listAdminCourierShifts,
  listAdminWorkerApplications,
  getAdminWorkerDocumentUrl,
  reviewWorkerApplication,
  updateAdminCourierShift,
} from "../../services/operationsService";
import { CourierShift, WorkerApplication } from "../../types/operations.types";
import { CourierDelivery } from "../../types/courier.types";

type Area = "applications" | "shifts" | "deliveries";

export default function WorkforceAdminScreen() {
  const [area, setArea] = useState<Area>("applications");
  const [applications, setApplications] = useState<WorkerApplication[]>([]);
  const [shifts, setShifts] = useState<CourierShift[]>([]);
  const [deliveries, setDeliveries] = useState<CourierDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<WorkerApplication | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [cancelling, setCancelling] = useState<CourierDelivery | null>(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [zone, setZone] = useState("");
  const [date, setDate] = useState(nextDate());
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("13:00");
  const [capacity, setCapacity] = useState("10");
  const [cutoff, setCutoff] = useState("60");
  const [incentive, setIncentive] = useState("");

  const load = useCallback(async () => {
    try {
      setError(null);
      const [nextApplications, nextShifts, nextDeliveries] = await Promise.all([listAdminWorkerApplications(), listAdminCourierShifts(), listAdminCourierDeliveries()]);
      setApplications(nextApplications);
      setShifts(nextShifts);
      setDeliveries(nextDeliveries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load workforce operations.");
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const reviewQueue = useMemo(() => [...applications].sort((a, b) => priority(a.status) - priority(b.status) || b.updated_at.localeCompare(a.updated_at)), [applications]);
  const sortedShifts = useMemo(() => [...shifts].sort((a, b) => a.starts_at.localeCompare(b.starts_at)), [shifts]);

  async function openApplicationDocument(applicationId: string, documentId: string) {
    try {
      const url = await getAdminWorkerDocumentUrl(applicationId, documentId);
      await Linking.openURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to open this document.");
    }
  }

  async function setReview(application: WorkerApplication, status: "UNDER_REVIEW" | "APPROVED" | "REJECTED", note?: string) {
    try {
      setBusy(true); setError(null);
      await reviewWorkerApplication(application.id, status, note);
      setRejecting(null); setReviewNote("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update application review.");
    } finally { setBusy(false); }
  }

  function approve(application: WorkerApplication) {
    Alert.alert("Approve worker access?", `This promotes ${application.full_name} into the ${application.product} product.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Approve", onPress: () => void setReview(application, "APPROVED") },
    ]);
  }

  function resetShiftForm() {
    setEditingId(null); setZone(""); setDate(nextDate()); setStartTime("09:00"); setEndTime("13:00"); setCapacity("10"); setCutoff("60"); setIncentive("");
  }

  function editShift(shift: CourierShift) {
    const start = new Date(shift.starts_at); const end = new Date(shift.ends_at);
    setEditingId(shift.id); setZone(shift.zone); setDate(localDate(start)); setStartTime(localTime(start)); setEndTime(localTime(end)); setCapacity(String(shift.capacity)); setCutoff(String(shift.booking_cutoff_minutes)); setIncentive(shift.incentive_usd == null ? "" : String(shift.incentive_usd));
  }

  async function saveShift() {
    const startsAt = new Date(`${date}T${startTime}:00`); const endsAt = new Date(`${date}T${endTime}:00`);
    const parsedCapacity = Number(capacity); const parsedCutoff = Number(cutoff); const parsedIncentive = incentive.trim() ? Number(incentive) : null;
    if (!zone.trim() || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt || !Number.isInteger(parsedCapacity) || parsedCapacity < 1 || !Number.isInteger(parsedCutoff) || parsedCutoff < 0 || (parsedIncentive !== null && (!Number.isFinite(parsedIncentive) || parsedIncentive < 0))) {
      setError("Enter a valid zone, date, time range, capacity, cutoff and optional incentive."); return;
    }
    const payload = { zone: zone.trim(), starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), capacity: parsedCapacity, booking_cutoff_minutes: parsedCutoff, incentive_usd: parsedIncentive, active: true };
    try {
      setBusy(true); setError(null);
      if (editingId) await updateAdminCourierShift(editingId, payload); else await createAdminCourierShift(payload);
      resetShiftForm(); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to save shift."); }
    finally { setBusy(false); }
  }

  async function toggleShift(shift: CourierShift) {
    try { setBusy(true); setError(null); await updateAdminCourierShift(shift.id, { active: !shift.active }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to update shift."); }
    finally { setBusy(false); }
  }

  async function confirmDeliveryCancellation() {
    if (!cancelling || !cancellationReason.trim()) return;
    try { setBusy(true); setError(null); await cancelCourierDelivery(cancelling.id, cancellationReason.trim()); setCancelling(null); setCancellationReason(""); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to cancel delivery."); }
    finally { setBusy(false); }
  }

  return (
    <Screen title="Workforce" showBack fallbackRoute="/(admin)/dashboard" showNotifications={false} onRefresh={load} refreshing={loading}>
      <Modal visible={Boolean(rejecting)} transparent animationType="fade" onRequestClose={() => setRejecting(null)}>
        <View style={styles.backdrop}><View style={styles.modal}><View style={styles.modalTop}><Text style={styles.modalTitle}>Reject application</Text><Pressable accessibilityRole="button" accessibilityLabel="Close rejection" onPress={() => setRejecting(null)}><MaterialCommunityIcons name="close" size={23} color={v2Theme.colors.ink} /></Pressable></View><Text style={styles.body}>Give the applicant a clear, actionable reason. They can correct the application and resubmit.</Text><TextInput value={reviewNote} onChangeText={setReviewNote} placeholder="Required review note" placeholderTextColor={v2Theme.colors.inkTertiary} multiline style={[styles.input, styles.note]} /><Pressable accessibilityRole="button" disabled={busy || !reviewNote.trim()} onPress={() => rejecting && setReview(rejecting, "REJECTED", reviewNote.trim())} style={[styles.dangerButton, (busy || !reviewNote.trim()) && styles.disabled]}><Text style={styles.dangerText}>{busy ? "Saving…" : "Reject with note"}</Text></Pressable></View></View>
      </Modal>
      <Modal visible={Boolean(cancelling)} transparent animationType="fade" onRequestClose={() => setCancelling(null)}><View style={styles.backdrop}><View style={styles.modal}><View style={styles.modalTop}><Text style={styles.modalTitle}>Cancel delivery</Text><Pressable accessibilityRole="button" accessibilityLabel="Close cancellation" onPress={() => setCancelling(null)}><MaterialCommunityIcons name="close" size={23} color={v2Theme.colors.ink} /></Pressable></View><Text style={styles.body}>Use this only for a support or safety exception. The customer, Courier and linked Food order will update together.</Text><TextInput value={cancellationReason} onChangeText={setCancellationReason} placeholder="Required operational reason" placeholderTextColor={v2Theme.colors.inkTertiary} multiline style={[styles.input, styles.note]} /><Pressable accessibilityRole="button" disabled={busy || !cancellationReason.trim()} onPress={confirmDeliveryCancellation} style={[styles.dangerButton, (busy || !cancellationReason.trim()) && styles.disabled]}><Text style={styles.dangerText}>{busy ? "Cancelling…" : "Cancel and synchronize"}</Text></Pressable></View></View></Modal>
      <View style={styles.hero}><Text style={styles.eyebrow}>ADMIN ONLY</Text><Text style={styles.title}>Workforce operations</Text><Text style={styles.heroBody}>Review applications without public role escalation and operate real Courier shift capacity.</Text></View>
      <View style={styles.tabs}>{(["applications", "shifts", "deliveries"] as Area[]).map((item) => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: area === item }} onPress={() => setArea(item)} style={[styles.tab, area === item && styles.tabActive]}><Text style={[styles.tabText, area === item && styles.tabTextActive]}>{item === "applications" ? `Applications · ${applications.length}` : item === "shifts" ? `Shifts · ${shifts.length}` : `Deliveries · ${deliveries.length}`}</Text></Pressable>)}</View>
      {loading ? <LoadingState label="Loading workforce operations…" /> : null}
      {error ? <Pressable accessibilityRole="button" onPress={load} style={styles.error}><Text style={styles.errorText}>{error}</Text><Text style={styles.retry}>Retry</Text></Pressable> : null}
      {!loading && area === "applications" ? <View style={styles.list}>{reviewQueue.length === 0 ? <Empty icon="account-search-outline" title="No applications" body="Submitted Courier, Driver and Merchant applications appear here." /> : reviewQueue.map((application) => <View key={application.id} style={styles.card}><View style={styles.cardTop}><Status value={application.status} /><Text style={styles.product}>{application.product.toUpperCase()}</Text></View><Text style={styles.cardTitle}>{application.business_name || application.full_name}</Text><Text style={styles.body}>{application.full_name} · {application.phone}</Text><Text style={styles.body}>{application.service_area}{application.vehicle ? ` · ${application.vehicle}` : ""}</Text><View style={styles.documents}>{application.required_document_types.map((type) => { const document = application.documents.find((item) => item.document_type === type); return <Pressable key={type} accessibilityRole="button" disabled={!document?.has_file} onPress={() => document?.has_file && void openApplicationDocument(application.id, document.id)} style={[styles.document, !document && styles.documentMissing]}><MaterialCommunityIcons name={document ? "file-check-outline" : "file-alert-outline"} size={18} color={document ? v2Theme.colors.brandStrong : v2Theme.colors.danger} /><Text style={styles.documentText}>{type.replaceAll("_", " ")}</Text>{document?.has_file ? <MaterialCommunityIcons name="open-in-new" size={14} color={v2Theme.colors.inkSecondary} /> : null}</Pressable>; })}</View>{application.review_note ? <Text style={styles.noteCopy}>Review note: {application.review_note}</Text> : null}{["SUBMITTED", "UNDER_REVIEW"].includes(application.status) ? <View style={styles.actions}>{application.status === "SUBMITTED" ? <Action label="Begin review" onPress={() => setReview(application, "UNDER_REVIEW")} disabled={busy} /> : null}<Action label="Approve" primary onPress={() => approve(application)} disabled={busy || application.missing_document_types.length > 0} /><Action label="Reject" danger onPress={() => { setRejecting(application); setReviewNote(""); }} disabled={busy} /></View> : null}</View>)}</View> : null}
      {!loading && area === "shifts" ? <><View style={styles.form}><View style={styles.formTop}><Text style={styles.sectionTitle}>{editingId ? "Edit shift" : "Create shift"}</Text>{editingId ? <Pressable accessibilityRole="button" onPress={resetShiftForm}><Text style={styles.cancel}>Cancel edit</Text></Pressable> : null}</View><Field label="Zone" value={zone} onChangeText={setZone} placeholder="Harare Central" /><View style={styles.row}><Field label="Date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" /><Field label="Start" value={startTime} onChangeText={setStartTime} placeholder="09:00" /><Field label="End" value={endTime} onChangeText={setEndTime} placeholder="13:00" /></View><View style={styles.row}><Field label="Capacity" value={capacity} onChangeText={setCapacity} keyboardType="number-pad" /><Field label="Cutoff min" value={cutoff} onChangeText={setCutoff} keyboardType="number-pad" /><Field label="Incentive USD" value={incentive} onChangeText={setIncentive} keyboardType="decimal-pad" placeholder="Optional" /></View><Pressable accessibilityRole="button" disabled={busy} onPress={saveShift} style={[styles.primaryButton, busy && styles.disabled]}><Text style={styles.primaryText}>{busy ? "Saving…" : editingId ? "Save shift changes" : "Publish available shift"}</Text></Pressable></View><View style={styles.list}>{sortedShifts.length === 0 ? <Empty icon="calendar-blank-outline" title="No Courier shifts" body="Create the first real shift above." /> : sortedShifts.map((shift) => <View key={shift.id} style={[styles.card, !shift.active && styles.inactive]}><View style={styles.cardTop}><Status value={shift.status} /><Text style={styles.product}>{shift.remaining_places}/{shift.capacity} PLACES</Text></View><Text style={styles.cardTitle}>{shift.zone}</Text><Text style={styles.body}>{formatShift(shift)} · booking cutoff {shift.booking_cutoff_minutes} min</Text>{shift.incentive_usd != null ? <Text style={styles.incentive}>${shift.incentive_usd.toFixed(2)} shift incentive</Text> : null}<View style={styles.actions}><Action label="Edit" onPress={() => editShift(shift)} disabled={busy} /><Action label={shift.active ? "Deactivate" : "Activate"} danger={shift.active} primary={!shift.active} onPress={() => toggleShift(shift)} disabled={busy} /></View></View>)}</View></> : null}
      {!loading && area === "deliveries" ? <View style={styles.list}>{deliveries.length === 0 ? <Empty icon="package-variant-closed" title="No deliveries" body="Courier and Food delivery operations appear here." /> : deliveries.map((delivery) => { const terminal = ["DELIVERED", "CANCELLED", "FAILED"].includes(delivery.status); return <View key={delivery.id} style={[styles.card, terminal && styles.inactive]}><View style={styles.cardTop}><Status value={delivery.status} /><Text style={styles.product}>{delivery.source_type === "FOOD_ORDER" ? "FOOD" : "COURIER"}</Text></View><Text style={styles.cardTitle}>{delivery.pickup_address} → {delivery.dropoff_address}</Text><Text style={styles.body}>{delivery.courier_name || "Courier not assigned"} · {delivery.id.slice(0, 8).toUpperCase()}</Text>{!terminal ? <View style={styles.actions}><Action label="Support cancellation" danger disabled={busy} onPress={() => { setCancelling(delivery); setCancellationReason(""); }} /></View> : null}</View>; })}</View> : null}
    </Screen>
  );
}

function Field({ label, value, onChangeText, placeholder, keyboardType }: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string; keyboardType?: "default" | "number-pad" | "decimal-pad" }) { return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} keyboardType={keyboardType} placeholderTextColor={v2Theme.colors.inkTertiary} style={styles.input} /></View>; }
function Action({ label, onPress, primary, danger, disabled }: { label: string; onPress: () => void; primary?: boolean; danger?: boolean; disabled?: boolean }) { return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.action, primary && styles.actionPrimary, danger && styles.actionDanger, disabled && styles.disabled]}><Text style={[styles.actionText, primary && styles.actionTextPrimary, danger && styles.actionTextDanger]}>{label}</Text></Pressable>; }
function Status({ value }: { value: string }) { const positive = ["APPROVED", "UPCOMING", "IN_PROGRESS"].includes(value); const negative = ["REJECTED", "INACTIVE"].includes(value); return <View style={[styles.status, positive && styles.statusPositive, negative && styles.statusNegative]}><Text style={[styles.statusText, positive && styles.statusTextPositive, negative && styles.statusTextNegative]}>{value.replaceAll("_", " ")}</Text></View>; }
function Empty({ icon, title, body }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; body: string }) { return <View style={styles.empty}><MaterialCommunityIcons name={icon} size={32} color={v2Theme.colors.brandStrong} /><Text style={styles.cardTitle}>{title}</Text><Text style={styles.body}>{body}</Text></View>; }
function priority(status: string) { return status === "SUBMITTED" ? 0 : status === "UNDER_REVIEW" ? 1 : status === "REJECTED" ? 2 : status === "APPROVED" ? 3 : 4; }
function nextDate() { const value = new Date(); value.setDate(value.getDate() + 1); return localDate(value); }
function localDate(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; }
function localTime(value: Date) { return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`; }
function formatShift(shift: CourierShift) { const start = new Date(shift.starts_at); const end = new Date(shift.ends_at); return `${start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · ${localTime(start)}–${localTime(end)}`; }

const styles = StyleSheet.create({
  hero: { borderRadius: 27, backgroundColor: v2Theme.colors.ink, padding: 19, gap: 7 }, eyebrow: { color: "#8FE6AE", fontSize: 9, fontWeight: "900", letterSpacing: 1.1 }, title: { color: "#FFFFFF", fontSize: 28, fontWeight: "900", letterSpacing: -0.8 }, heroBody: { color: "rgba(255,255,255,0.64)", fontSize: 10, lineHeight: 16 }, tabs: { flexDirection: "row", gap: 7 }, tab: { flex: 1, minHeight: 47, borderRadius: 15, backgroundColor: v2Theme.colors.surface, alignItems: "center", justifyContent: "center" }, tabActive: { backgroundColor: v2Theme.colors.brand }, tabText: { color: v2Theme.colors.inkSecondary, fontSize: 9, fontWeight: "900" }, tabTextActive: { color: "#FFFFFF" }, error: { borderRadius: 17, backgroundColor: v2Theme.colors.dangerSoft, padding: 12, flexDirection: "row", gap: 9 }, errorText: { flex: 1, color: v2Theme.colors.danger, fontSize: 10, fontWeight: "700" }, retry: { color: v2Theme.colors.danger, fontSize: 10, fontWeight: "900" }, list: { gap: 10 }, card: { borderRadius: 23, backgroundColor: v2Theme.colors.surface, padding: 14, gap: 8 }, inactive: { opacity: 0.62 }, cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }, cardTitle: { color: v2Theme.colors.ink, fontSize: 16, fontWeight: "900" }, body: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15 }, product: { color: v2Theme.colors.inkSecondary, fontSize: 8, fontWeight: "900" }, status: { borderRadius: 999, backgroundColor: v2Theme.colors.warningSoft, paddingHorizontal: 9, paddingVertical: 6 }, statusPositive: { backgroundColor: v2Theme.colors.brandSoft }, statusNegative: { backgroundColor: v2Theme.colors.dangerSoft }, statusText: { color: v2Theme.colors.warning, fontSize: 7, fontWeight: "900" }, statusTextPositive: { color: v2Theme.colors.brandStrong }, statusTextNegative: { color: v2Theme.colors.danger }, documents: { flexDirection: "row", flexWrap: "wrap", gap: 6 }, document: { borderRadius: 12, backgroundColor: v2Theme.colors.brandSofter, paddingHorizontal: 8, paddingVertical: 7, flexDirection: "row", alignItems: "center", gap: 5 }, documentMissing: { backgroundColor: v2Theme.colors.dangerSoft }, documentText: { color: v2Theme.colors.inkSecondary, fontSize: 7, fontWeight: "800", textTransform: "capitalize" }, noteCopy: { borderRadius: 12, backgroundColor: v2Theme.colors.warningSoft, padding: 9, color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14 }, actions: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, action: { minHeight: 42, borderRadius: 13, backgroundColor: v2Theme.colors.surfaceMuted, paddingHorizontal: 13, alignItems: "center", justifyContent: "center" }, actionPrimary: { backgroundColor: v2Theme.colors.brand }, actionDanger: { backgroundColor: v2Theme.colors.dangerSoft }, actionText: { color: v2Theme.colors.ink, fontSize: 9, fontWeight: "900" }, actionTextPrimary: { color: "#FFFFFF" }, actionTextDanger: { color: v2Theme.colors.danger }, form: { borderRadius: 24, backgroundColor: v2Theme.colors.surface, padding: 14, gap: 10 }, formTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, sectionTitle: { color: v2Theme.colors.ink, fontSize: 17, fontWeight: "900" }, cancel: { color: v2Theme.colors.danger, fontSize: 9, fontWeight: "900" }, row: { flexDirection: "row", gap: 7 }, field: { flex: 1, gap: 4 }, label: { color: v2Theme.colors.inkSecondary, fontSize: 8, fontWeight: "900", textTransform: "uppercase" }, input: { minHeight: 46, borderRadius: 14, backgroundColor: v2Theme.colors.surfaceMuted, paddingHorizontal: 10, color: v2Theme.colors.ink, fontSize: 10, fontWeight: "700" }, primaryButton: { minHeight: 49, borderRadius: 15, backgroundColor: v2Theme.colors.brand, alignItems: "center", justifyContent: "center" }, primaryText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" }, incentive: { color: v2Theme.colors.brandStrong, fontSize: 10, fontWeight: "900" }, empty: { borderRadius: 24, backgroundColor: v2Theme.colors.surface, padding: 19, gap: 8, alignItems: "center" }, backdrop: { flex: 1, backgroundColor: "rgba(14,17,15,0.42)", justifyContent: "center", padding: 22 }, modal: { borderRadius: 25, backgroundColor: v2Theme.colors.canvas, padding: 17, gap: 11 }, modalTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, modalTitle: { color: v2Theme.colors.ink, fontSize: 20, fontWeight: "900" }, note: { minHeight: 96, paddingTop: 12, textAlignVertical: "top" }, dangerButton: { minHeight: 49, borderRadius: 15, backgroundColor: v2Theme.colors.danger, alignItems: "center", justifyContent: "center" }, dangerText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" }, disabled: { opacity: 0.42 },
});
