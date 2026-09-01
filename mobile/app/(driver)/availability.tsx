import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";
import { createWorkAvailability, deleteWorkAvailability, listWorkAvailability } from "../../services/operationsService";
import { WorkAvailability } from "../../types/operations.types";

export default function AvailabilityScreen() {
  const [items, setItems] = useState<WorkAvailability[]>([]);
  const mode = "ride" as const;
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
      setItems((await listWorkAvailability()).filter((item) => item.mode === "ride"));
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
    <Screen navRole="driver" title="Intercity calendar" showNotifications>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>INTERCITY CALENDAR</Text>
        <Text style={styles.title}>When can you drive?</Text>
        <Text style={styles.body}>Plan availability for scheduled intercity routes. This calendar stays separate from Ride Now’s live online status.</Text>
      </View>

      <View style={styles.composer}>
        <View style={styles.composerHeader}>
          <View style={styles.composerIcon}>
            <MaterialCommunityIcons name="calendar-plus" size={21} color={v2Theme.colors.ink} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.composerTitle}>Add a driving window</Text>
            <Text style={styles.composerSub}>Date first, then the hours you’ll be available.</Text>
          </View>
        </View>

        <TextInput
          accessibilityLabel="Availability date"
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={v2Theme.colors.inkTertiary}
          autoCapitalize="none"
          style={[styles.input, styles.dateInput]}
        />
        <View style={styles.timeRail}>
          <View style={styles.timeStop}>
            <Text style={styles.timeLabel}>FROM</Text>
            <TextInput
              accessibilityLabel="Availability start time"
              value={startTime}
              onChangeText={setStartTime}
              placeholder="08:00"
              placeholderTextColor={v2Theme.colors.inkTertiary}
              autoCapitalize="none"
              style={styles.timeInput}
            />
          </View>
          <View style={styles.timeLine}>
            <MaterialCommunityIcons name="arrow-right" size={18} color={v2Theme.colors.inkTertiary} />
          </View>
          <View style={styles.timeStop}>
            <Text style={styles.timeLabel}>UNTIL</Text>
            <TextInput
              accessibilityLabel="Availability end time"
              value={endTime}
              onChangeText={setEndTime}
              placeholder="17:00"
              placeholderTextColor={v2Theme.colors.inkTertiary}
              autoCapitalize="none"
              style={styles.timeInput}
            />
          </View>
        </View>
        <TextInput
          accessibilityLabel="Availability note"
          value={note}
          onChangeText={setNote}
          placeholder="Optional note — e.g. Harare → Mutare"
          placeholderTextColor={v2Theme.colors.inkTertiary}
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add availability window"
          accessibilityState={{ disabled: !canAdd }}
          disabled={!canAdd}
          onPress={add}
          style={({ pressed }) => [styles.addButton, !canAdd && styles.disabled, pressed && canAdd && styles.pressed]}
        >
          <Text style={styles.addButtonText}>{busy ? "Saving…" : "Add to calendar"}</Text>
          <MaterialCommunityIcons name="arrow-right" size={20} color="#FFFFFF" />
        </Pressable>
      </View>

      {error ? (
        <View style={styles.errorCard}>
          <MaterialCommunityIcons name="alert-circle-outline" size={21} color={v2Theme.colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Your driving timeline</Text>
            <Text style={styles.sectionSub}>{items.length ? `${items.length} saved ${items.length === 1 ? "window" : "windows"}` : "Nothing scheduled yet"}</Text>
          </View>
        </View>

        {loading ? <Text style={styles.loading}>Loading schedule…</Text> : null}
        {!loading && items.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <MaterialCommunityIcons name="calendar-blank-outline" size={27} color={v2Theme.colors.inkSecondary} />
            </View>
            <View style={styles.emptyCopy}>
              <Text style={styles.emptyTitle}>Your road is open.</Text>
              <Text style={styles.emptyBody}>Add a driving window above when you know when you’ll be available for intercity trips.</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.timeline}>
          {items.map((item, index) => (
            <View key={item.id} style={styles.timelineRow}>
              <View style={styles.timelineRail}>
                <View style={styles.timelineDot} />
                {index < items.length - 1 ? <View style={styles.timelineLine} /> : null}
              </View>
              <View style={styles.windowCard}>
                <View style={styles.windowTop}>
                  <View style={styles.flex}>
                    <Text style={styles.windowDate}>{formatDate(item.date)}</Text>
                    <Text style={styles.windowTime}>{item.start_time} – {item.end_time}</Text>
                  </View>
                  <View style={styles.driverPill}>
                    <MaterialCommunityIcons name="car-outline" size={14} color={v2Theme.colors.brandStrong} />
                    <Text style={styles.driverPillText}>DRIVE</Text>
                  </View>
                </View>
                {item.note ? <Text numberOfLines={2} style={styles.windowNote}>{item.note}</Text> : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove availability ${item.date}`}
                  onPress={() => remove(item.id)}
                  disabled={busy}
                  hitSlop={8}
                  style={({ pressed }) => [styles.removeAction, pressed && styles.pressed]}
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={16} color={v2Theme.colors.danger} />
                  <Text style={styles.removeText}>Remove window</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      </View>
    </Screen>
  );
}

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { gap: 6, paddingBottom: 3 },
  eyebrow: { color: v2Theme.colors.brandStrong, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: v2Theme.colors.ink, fontSize: 31, lineHeight: 35, fontWeight: "900", letterSpacing: -1 },
  body: { color: v2Theme.colors.inkSecondary, fontSize: 12, lineHeight: 18, maxWidth: 335 },
  composer: { borderRadius: 28, backgroundColor: v2Theme.colors.ink, padding: 15, gap: 11, shadowColor: v2Theme.colors.shadow, shadowOpacity: 0.11, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  composerHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 2 },
  composerIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  composerTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  composerSub: { color: "rgba(255,255,255,0.56)", fontSize: 9, lineHeight: 13, marginTop: 2 },
  input: { minHeight: 49, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.10)", paddingHorizontal: 13, color: "#FFFFFF", fontSize: 12, fontWeight: "800", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.12)" },
  dateInput: { fontSize: 14, fontWeight: "900" },
  timeRail: { flexDirection: "row", alignItems: "center", gap: 7 },
  timeStop: { flex: 1, minHeight: 70, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.10)", paddingHorizontal: 12, paddingVertical: 9, justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.12)" },
  timeLabel: { color: "rgba(255,255,255,0.42)", fontSize: 8, fontWeight: "900", letterSpacing: 0.9 },
  timeInput: { color: "#FFFFFF", fontSize: 18, lineHeight: 22, fontWeight: "900", paddingVertical: 2 },
  timeLine: { width: 24, alignItems: "center" },
  addButton: { minHeight: 52, borderRadius: 17, backgroundColor: v2Theme.colors.brand, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  addButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  errorCard: { borderRadius: 18, backgroundColor: v2Theme.colors.dangerSoft, padding: 12, flexDirection: "row", alignItems: "center", gap: 9 },
  errorText: { flex: 1, color: v2Theme.colors.danger, fontSize: 10, lineHeight: 15, fontWeight: "800" },
  section: { gap: 12 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: v2Theme.colors.ink, fontSize: 20, fontWeight: "900", letterSpacing: -0.4 },
  sectionSub: { color: v2Theme.colors.inkSecondary, fontSize: 9, marginTop: 2 },
  loading: { color: v2Theme.colors.inkSecondary, fontSize: 11 },
  emptyState: { minHeight: 90, borderRadius: 23, backgroundColor: v2Theme.colors.surface, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  emptyIcon: { width: 49, height: 49, borderRadius: 17, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  emptyCopy: { flex: 1, gap: 3 },
  emptyTitle: { color: v2Theme.colors.ink, fontSize: 13, fontWeight: "900" },
  emptyBody: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14 },
  timeline: { gap: 0 },
  timelineRow: { flexDirection: "row", alignItems: "stretch", gap: 10 },
  timelineRail: { width: 18, alignItems: "center" },
  timelineDot: { width: 12, height: 12, borderRadius: 6, marginTop: 22, backgroundColor: v2Theme.colors.brand, borderWidth: 3, borderColor: v2Theme.colors.brandSoft },
  timelineLine: { width: 2, flex: 1, minHeight: 80, backgroundColor: v2Theme.colors.lineStrong, marginVertical: 3 },
  windowCard: { flex: 1, minHeight: 112, marginBottom: 10, borderRadius: 23, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 13, gap: 9 },
  windowTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  windowDate: { color: v2Theme.colors.ink, fontSize: 14, fontWeight: "900" },
  windowTime: { color: v2Theme.colors.brandStrong, fontSize: 11, fontWeight: "900", marginTop: 3 },
  driverPill: { minHeight: 28, borderRadius: 14, paddingHorizontal: 8, backgroundColor: v2Theme.colors.brandSoft, flexDirection: "row", alignItems: "center", gap: 4 },
  driverPillText: { color: v2Theme.colors.brandStrong, fontSize: 7, fontWeight: "900", letterSpacing: 0.7 },
  windowNote: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14 },
  removeAction: { alignSelf: "flex-start", minHeight: 30, flexDirection: "row", alignItems: "center", gap: 5 },
  removeText: { color: v2Theme.colors.danger, fontSize: 8, fontWeight: "900" },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
});
