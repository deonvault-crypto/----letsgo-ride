import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";

import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";
import { createWorkAvailability, deleteWorkAvailability, listWorkAvailability } from "../../services/operationsService";
import { WorkAvailability } from "../../types/operations.types";

export default function AvailabilityScreen() {
  const [items, setItems] = useState<WorkAvailability[]>([]);
  const [mode, setMode] = useState<"ride" | "courier">("courier");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setItems(await listWorkAvailability());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load availability.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const canAdd = useMemo(
    () => /^\d{4}-\d{2}-\d{2}$/.test(date.trim()) && /^\d{2}:\d{2}$/.test(startTime.trim()) && /^\d{2}:\d{2}$/.test(endTime.trim()) && !busy,
    [date, startTime, endTime, busy],
  );

  async function add() {
    if (!canAdd) return;
    try {
      setBusy(true);
      setError(null);
      const item = await createWorkAvailability({
        mode,
        date: date.trim(),
        start_time: startTime.trim(),
        end_time: endTime.trim(),
        note: note.trim() || null,
      });
      setItems((current) => [...current, item].sort((a, b) => `${a.date}${a.start_time}`.localeCompare(`${b.date}${b.start_time}`)));
      setDate("");
      setStartTime("");
      setEndTime("");
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add availability.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(itemId: string) {
    if (busy) return;
    try {
      setBusy(true);
      setError(null);
      await deleteWorkAvailability(itemId);
      setItems((current) => current.filter((item) => item.id !== itemId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove availability.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen showBack fallbackRoute="/(driver)/work" title="Availability" showNotifications={false}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>WORK CALENDAR</Text>
        <Text style={styles.title}>Tell LetsGoRide when you work.</Text>
        <Text style={styles.body}>Keep ride planning and courier availability separate, while managing both from one schedule.</Text>
      </View>

      <View style={styles.segmented}>
        <ModeButton label="Courier" active={mode === "courier"} onPress={() => setMode("courier")} />
        <ModeButton label="Ride" active={mode === "ride"} onPress={() => setMode("ride")} />
      </View>

      <View style={styles.formCard}>
        <Text style={styles.formTitle}>Add working window</Text>
        <TextInput accessibilityLabel="Availability date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={v2Theme.colors.inkTertiary} autoCapitalize="none" style={styles.input} />
        <View style={styles.timeRow}>
          <TextInput accessibilityLabel="Availability start time" value={startTime} onChangeText={setStartTime} placeholder="Start HH:MM" placeholderTextColor={v2Theme.colors.inkTertiary} autoCapitalize="none" style={[styles.input, styles.timeInput]} />
          <TextInput accessibilityLabel="Availability end time" value={endTime} onChangeText={setEndTime} placeholder="End HH:MM" placeholderTextColor={v2Theme.colors.inkTertiary} autoCapitalize="none" style={[styles.input, styles.timeInput]} />
        </View>
        <TextInput accessibilityLabel="Availability note" value={note} onChangeText={setNote} placeholder="Optional note" placeholderTextColor={v2Theme.colors.inkTertiary} style={styles.input} />
        <Pressable accessibilityRole="button" accessibilityLabel="Add availability window" accessibilityState={{ disabled: !canAdd }} disabled={!canAdd} onPress={add} style={({ pressed }) => [styles.addButton, !canAdd && styles.disabled, pressed && canAdd && styles.pressed]}>
          <Text style={styles.addButtonText}>{busy ? "Saving…" : "Add availability"}</Text>
          <MaterialCommunityIcons name="calendar-plus" size={20} color="#FFFFFF" />
        </Pressable>
      </View>

      {error ? <View style={styles.errorCard}><MaterialCommunityIcons name="alert-circle-outline" size={21} color={v2Theme.colors.danger} /><Text style={styles.errorText}>{error}</Text></View> : null}

      <View style={styles.section}>
        <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Upcoming windows</Text><Text style={styles.sectionSub}>Your saved working schedule</Text></View><Text style={styles.count}>{items.length}</Text></View>
        {loading ? <Text style={styles.loading}>Loading schedule…</Text> : null}
        {!loading && items.length === 0 ? (
          <View style={styles.emptyCard}><MaterialCommunityIcons name="calendar-blank-outline" size={28} color={v2Theme.colors.inkSecondary} /><View style={styles.emptyCopy}><Text style={styles.emptyTitle}>No availability yet</Text><Text style={styles.emptyBody}>Add the first window above. Matching can use this schedule later without changing your ride-posting flow.</Text></View></View>
        ) : null}
        <View style={styles.list}>
          {items.map((item) => (
            <View key={item.id} style={styles.itemCard}>
              <View style={[styles.modeIcon, item.mode === "courier" && styles.modeIconCourier]}>
                <MaterialCommunityIcons name={item.mode === "courier" ? "motorbike" : "car-clock"} size={22} color={item.mode === "courier" ? v2Theme.colors.brandStrong : v2Theme.colors.ink} />
              </View>
              <View style={styles.itemCopy}>
                <Text style={styles.itemTitle}>{formatDate(item.date)}</Text>
                <Text style={styles.itemTime}>{item.start_time} – {item.end_time} · {item.mode === "courier" ? "Courier" : "Ride"}</Text>
                {item.note ? <Text numberOfLines={1} style={styles.itemNote}>{item.note}</Text> : null}
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove availability ${item.date}`} onPress={() => remove(item.id)} disabled={busy} hitSlop={8} style={styles.removeButton}>
                <MaterialCommunityIcons name="trash-can-outline" size={20} color={v2Theme.colors.danger} />
              </Pressable>
            </View>
          ))}
        </View>
      </View>
    </Screen>
  );
}

function ModeButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.modeButton, active && styles.modeButtonActive]}><Text style={[styles.modeButtonText, active && styles.modeButtonTextActive]}>{label}</Text></Pressable>;
}

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

const styles = StyleSheet.create({
  hero: { gap: 7 },
  eyebrow: { color: v2Theme.colors.brandStrong, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: v2Theme.colors.ink, fontSize: 31, lineHeight: 36, fontWeight: "900", letterSpacing: -1 },
  body: { color: v2Theme.colors.inkSecondary, fontSize: 14, lineHeight: 21 },
  segmented: { minHeight: 50, borderRadius: 16, backgroundColor: v2Theme.colors.surfaceMuted, padding: 4, flexDirection: "row", gap: 4 },
  modeButton: { flex: 1, minHeight: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  modeButtonActive: { backgroundColor: v2Theme.colors.surface },
  modeButtonText: { color: v2Theme.colors.inkSecondary, fontSize: 11, fontWeight: "900" },
  modeButtonTextActive: { color: v2Theme.colors.ink },
  formCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 14, gap: 10 },
  formTitle: { color: v2Theme.colors.ink, fontSize: 15, fontWeight: "900" },
  input: { minHeight: 48, borderRadius: 14, backgroundColor: v2Theme.colors.surfaceMuted, paddingHorizontal: 12, color: v2Theme.colors.ink, fontSize: 12, fontWeight: "800" },
  timeRow: { flexDirection: "row", gap: 8 },
  timeInput: { flex: 1 },
  addButton: { minHeight: 48, borderRadius: 14, backgroundColor: v2Theme.colors.brand, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  addButtonText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  errorCard: { borderRadius: v2Theme.radius.lg, backgroundColor: v2Theme.colors.dangerSoft, padding: 12, flexDirection: "row", alignItems: "center", gap: 9 },
  errorText: { flex: 1, color: v2Theme.colors.danger, fontSize: 11, fontWeight: "700" },
  section: { gap: 10 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: v2Theme.colors.ink, fontSize: 20, fontWeight: "900", letterSpacing: -0.4 },
  sectionSub: { color: v2Theme.colors.inkSecondary, fontSize: 10, marginTop: 2 },
  count: { minWidth: 32, textAlign: "center", color: v2Theme.colors.ink, backgroundColor: v2Theme.colors.surfaceMuted, borderRadius: v2Theme.radius.pill, overflow: "hidden", paddingVertical: 6, paddingHorizontal: 8, fontSize: 10, fontWeight: "900" },
  loading: { color: v2Theme.colors.inkSecondary, fontSize: 11 },
  emptyCard: { minHeight: 82, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  emptyCopy: { flex: 1, gap: 3 },
  emptyTitle: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900" },
  emptyBody: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15 },
  list: { gap: 8 },
  itemCard: { minHeight: 78, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 12, flexDirection: "row", alignItems: "center", gap: 11 },
  modeIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  modeIconCourier: { backgroundColor: v2Theme.colors.brandSoft },
  itemCopy: { flex: 1, gap: 3 },
  itemTitle: { color: v2Theme.colors.ink, fontSize: 13, fontWeight: "900" },
  itemTime: { color: v2Theme.colors.inkSecondary, fontSize: 10, fontWeight: "800" },
  itemNote: { color: v2Theme.colors.inkTertiary, fontSize: 9 },
  removeButton: { width: 38, height: 38, borderRadius: 13, backgroundColor: v2Theme.colors.dangerSoft, alignItems: "center", justifyContent: "center" },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
});
