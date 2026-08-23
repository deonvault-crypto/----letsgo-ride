import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";

import { LoadingState } from "../../components/states/LoadingState";
import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";
import { bookCourierShift, cancelCourierShift, listAvailableCourierShifts, listMyCourierShifts } from "../../services/operationsService";
import { CourierShift, CourierShiftBooking } from "../../types/operations.types";

type ViewMode = "available" | "upcoming" | "completed" | "cancelled";

export default function CourierScheduleScreen() {
  const [available, setAvailable] = useState<CourierShift[]>([]);
  const [bookings, setBookings] = useState<CourierShiftBooking[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [mode, setMode] = useState<ViewMode>("available");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [nextAvailable, nextBookings] = await Promise.all([listAvailableCourierShifts(), listMyCourierShifts()]);
      setAvailable(nextAvailable);
      setBookings(nextBookings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load shifts.");
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => { const value = new Date(); value.setHours(12, 0, 0, 0); value.setDate(value.getDate() + index); return value; }), []);
  const rows = useMemo(() => {
    if (mode === "available") return available.filter((shift) => dateKey(shift.starts_at) === selectedDate).map((shift) => ({ key: shift.id, shift, booking: null }));
    return bookings
      .filter((booking) => mode === "upcoming" ? booking.status === "BOOKED" : booking.status === mode.toUpperCase())
      .filter((booking) => mode === "completed" || mode === "cancelled" || dateKey(booking.shift.starts_at) === selectedDate)
      .map((booking) => ({ key: booking.id, shift: booking.shift, booking }));
  }, [available, bookings, mode, selectedDate]);

  async function book(shift: CourierShift) {
    try { setBusyId(shift.id); setError(null); await bookCourierShift(shift.id); await load(); setMode("upcoming"); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to book this shift."); }
    finally { setBusyId(null); }
  }
  async function cancel(booking: CourierShiftBooking) {
    try { setBusyId(booking.id); setError(null); await cancelCourierShift(booking.id); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to cancel this shift."); }
    finally { setBusyId(null); }
  }

  return (
    <Screen title="Schedule" navRole="courier" onRefresh={load} refreshing={loading}>
      <View style={styles.hero}><Text style={styles.eyebrow}>COURIER CALENDAR</Text><Text style={styles.title}>Choose when you work.</Text><Text style={styles.body}>Book operating capacity by zone. Remaining places and booking cutoffs come directly from the shift service.</Text></View>
      <View style={styles.calendar}><View style={styles.monthRow}><Text style={styles.month}>{new Date(`${selectedDate}T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</Text><MaterialCommunityIcons name="calendar-month-outline" size={22} color={v2Theme.colors.brandStrong} /></View><View style={styles.days}>{days.map((day) => { const key = localDateKey(day); const active = key === selectedDate; const count = available.filter((shift) => dateKey(shift.starts_at) === key).length; return <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => setSelectedDate(key)} style={[styles.day, active && styles.dayActive]}><Text style={[styles.weekday, active && styles.dayTextActive]}>{day.toLocaleDateString(undefined, { weekday: "narrow" })}</Text><Text style={[styles.dayNumber, active && styles.dayTextActive]}>{day.getDate()}</Text>{count ? <View style={[styles.dot, active && styles.dotActive]} /> : null}</Pressable>; })}</View></View>
      <View style={styles.tabs}><Tab label="Available" active={mode === "available"} onPress={() => setMode("available")} /><Tab label="Upcoming" active={mode === "upcoming"} onPress={() => setMode("upcoming")} /><Tab label="Completed" active={mode === "completed"} onPress={() => setMode("completed")} /><Tab label="Cancelled" active={mode === "cancelled"} onPress={() => setMode("cancelled")} /></View>
      {loading ? <LoadingState label="Loading real shift capacity…" /> : null}
      {error ? <Pressable accessibilityRole="button" onPress={load} style={styles.error}><Text style={styles.errorText}>{error}</Text><Text style={styles.retry}>Retry</Text></Pressable> : null}
      {!loading && rows.length === 0 ? <View style={styles.empty}><MaterialCommunityIcons name="calendar-blank-outline" size={30} color={v2Theme.colors.inkSecondary} /><Text style={styles.emptyTitle}>Nothing in this view</Text><Text style={styles.emptyBody}>{mode === "available" ? "There are no active shifts with capacity on this date." : `No ${mode} shifts to show.`}</Text></View> : null}
      <View style={styles.list}>{rows.map(({ key, shift, booking }) => <ShiftCard key={key} shift={shift} booking={booking} busy={busyId === key || busyId === shift.id} onBook={() => book(shift)} onCancel={() => booking && cancel(booking)} />)}</View>
    </Screen>
  );
}

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) { return <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.tab, active && styles.tabActive]}><Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text></Pressable>; }
function ShiftCard({ shift, booking, busy, onBook, onCancel }: { shift: CourierShift; booking: CourierShiftBooking | null; busy: boolean; onBook: () => void; onCancel: () => void }) {
  const starts = new Date(shift.starts_at); const ends = new Date(shift.ends_at);
  return <View style={styles.shift}><View style={styles.shiftStripe} /><View style={styles.shiftMain}><View style={styles.shiftTop}><View><Text style={styles.shiftTime}>{formatTime(starts)}–{formatTime(ends)}</Text><Text style={styles.zone}>{shift.zone}</Text></View><View style={styles.places}><Text style={styles.placesValue}>{shift.remaining_places}</Text><Text style={styles.placesLabel}>PLACES</Text></View></View>{shift.incentive_usd != null ? <View style={styles.incentive}><MaterialCommunityIcons name="star-four-points" size={16} color={v2Theme.colors.warning} /><Text style={styles.incentiveText}>${shift.incentive_usd.toFixed(2)} shift incentive</Text></View> : null}<Text style={styles.cutoff}>Booking closes {shift.booking_cutoff_minutes} minutes before start.</Text>{!booking ? <Pressable accessibilityRole="button" disabled={!shift.booking_open || busy} onPress={onBook} style={[styles.action, (!shift.booking_open || busy) && styles.disabled]}><Text style={styles.actionText}>{busy ? "Booking…" : shift.booking_open ? "Book shift" : "Booking closed"}</Text></Pressable> : booking.status === "BOOKED" ? <Pressable accessibilityRole="button" disabled={busy || shift.status !== "UPCOMING"} onPress={onCancel} style={[styles.cancel, (busy || shift.status !== "UPCOMING") && styles.disabled]}><Text style={styles.cancelText}>{busy ? "Cancelling…" : "Cancel shift"}</Text></Pressable> : <View style={styles.status}><Text style={styles.statusText}>{booking.status}</Text></View>}</View></View>;
}
function formatTime(value: Date) { return Number.isNaN(value.getTime()) ? "—" : value.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }); }
function localDateKey(value: Date) { const year = value.getFullYear(); const month = String(value.getMonth() + 1).padStart(2, "0"); const day = String(value.getDate()).padStart(2, "0"); return `${year}-${month}-${day}`; }
function dateKey(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value.slice(0, 10) : localDateKey(date); }
function todayKey() { return localDateKey(new Date()); }

const styles = StyleSheet.create({ hero: { gap: 7 }, eyebrow: { color: v2Theme.colors.brandStrong, fontSize: 9, fontWeight: "900", letterSpacing: 1.1 }, title: { color: v2Theme.colors.ink, fontSize: 30, lineHeight: 35, fontWeight: "900", letterSpacing: -0.9 }, body: { color: v2Theme.colors.inkSecondary, fontSize: 12, lineHeight: 18 }, calendar: { borderRadius: 25, backgroundColor: v2Theme.colors.ink, padding: 14, gap: 12 }, monthRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, month: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" }, days: { flexDirection: "row", gap: 5 }, day: { flex: 1, minHeight: 59, borderRadius: 15, alignItems: "center", justifyContent: "center", gap: 3 }, dayActive: { backgroundColor: v2Theme.colors.brand }, weekday: { color: "rgba(255,255,255,0.5)", fontSize: 8, fontWeight: "900" }, dayNumber: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" }, dayTextActive: { color: "#FFFFFF" }, dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "#70DC98" }, dotActive: { backgroundColor: "#FFFFFF" }, tabs: { flexDirection: "row", borderRadius: 16, backgroundColor: v2Theme.colors.surfaceMuted, padding: 4, gap: 3 }, tab: { flex: 1, minHeight: 39, borderRadius: 12, alignItems: "center", justifyContent: "center" }, tabActive: { backgroundColor: v2Theme.colors.surface }, tabText: { color: v2Theme.colors.inkSecondary, fontSize: 8, fontWeight: "900" }, tabTextActive: { color: v2Theme.colors.ink }, error: { borderRadius: 17, backgroundColor: v2Theme.colors.dangerSoft, padding: 12, flexDirection: "row", gap: 9 }, errorText: { flex: 1, color: v2Theme.colors.danger, fontSize: 10, fontWeight: "700" }, retry: { color: v2Theme.colors.danger, fontSize: 10, fontWeight: "900" }, empty: { borderRadius: 24, backgroundColor: v2Theme.colors.surface, padding: 20, alignItems: "center", gap: 7 }, emptyTitle: { color: v2Theme.colors.ink, fontSize: 15, fontWeight: "900" }, emptyBody: { color: v2Theme.colors.inkSecondary, fontSize: 10, textAlign: "center" }, list: { gap: 10 }, shift: { borderRadius: 24, backgroundColor: v2Theme.colors.surface, overflow: "hidden", flexDirection: "row" }, shiftStripe: { width: 6, backgroundColor: v2Theme.colors.brand }, shiftMain: { flex: 1, padding: 14, gap: 9 }, shiftTop: { flexDirection: "row", justifyContent: "space-between", gap: 10 }, shiftTime: { color: v2Theme.colors.ink, fontSize: 18, fontWeight: "900" }, zone: { color: v2Theme.colors.inkSecondary, fontSize: 11, fontWeight: "700", marginTop: 3 }, places: { alignItems: "center", borderRadius: 14, backgroundColor: v2Theme.colors.brandSoft, minWidth: 58, padding: 8 }, placesValue: { color: v2Theme.colors.brandStrong, fontSize: 16, fontWeight: "900" }, placesLabel: { color: v2Theme.colors.brandStrong, fontSize: 6, fontWeight: "900" }, incentive: { flexDirection: "row", alignItems: "center", gap: 6 }, incentiveText: { color: v2Theme.colors.warning, fontSize: 10, fontWeight: "900" }, cutoff: { color: v2Theme.colors.inkTertiary, fontSize: 8 }, action: { minHeight: 47, borderRadius: 15, backgroundColor: v2Theme.colors.brand, alignItems: "center", justifyContent: "center" }, actionText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" }, cancel: { minHeight: 47, borderRadius: 15, backgroundColor: v2Theme.colors.dangerSoft, alignItems: "center", justifyContent: "center" }, cancelText: { color: v2Theme.colors.danger, fontSize: 11, fontWeight: "900" }, status: { alignSelf: "flex-start", borderRadius: 999, backgroundColor: v2Theme.colors.surfaceMuted, paddingHorizontal: 10, paddingVertical: 7 }, statusText: { color: v2Theme.colors.inkSecondary, fontSize: 8, fontWeight: "900" }, disabled: { opacity: 0.42 } });
