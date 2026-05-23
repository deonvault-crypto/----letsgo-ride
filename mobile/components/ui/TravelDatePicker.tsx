import { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { AppButton } from "./AppButton";

type TravelDatePickerProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
};

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(days: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
}

function formatDisplay(value: string) {
  if (!value) return "Select date";
  const date = new Date(`${value}T12:00:00`);
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function TravelDatePicker({ label, value, onChangeText }: TravelDatePickerProps) {
  const [open, setOpen] = useState(false);
  const nextDates = useMemo(() => Array.from({ length: 14 }, (_, index) => addDays(index)), []);
  const weekend = useMemo(() => {
    const today = new Date();
    const day = today.getDay();
    const daysUntilSaturday = (6 - day + 7) % 7 || 7;
    return addDays(daysUntilSaturday);
  }, []);

  function pick(date: Date) {
    onChangeText(toIsoDate(date));
    setOpen(false);
  }

  return (
    <>
      <Pressable style={styles.field} onPress={() => setOpen(true)}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.value, !value && styles.placeholder]}>{formatDisplay(value)}</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Travel date</Text>
            <View style={styles.quickRow}>
              <DateChip label="Today" onPress={() => pick(addDays(0))} />
              <DateChip label="Tomorrow" onPress={() => pick(addDays(1))} />
              <DateChip label="This weekend" onPress={() => pick(weekend)} />
            </View>
            <View style={styles.grid}>
              {nextDates.map((date) => {
                const iso = toIsoDate(date);
                const selected = iso === value;
                return (
                  <Pressable key={iso} style={[styles.day, selected && styles.daySelected]} onPress={() => pick(date)}>
                    <Text style={[styles.dayName, selected && styles.daySelectedText]}>
                      {date.toLocaleDateString(undefined, { weekday: "short" })}
                    </Text>
                    <Text style={[styles.dayNumber, selected && styles.daySelectedText]}>{date.getDate()}</Text>
                  </Pressable>
                );
              })}
            </View>
            <AppButton title="Cancel" variant="ghost" onPress={() => setOpen(false)} />
          </View>
        </View>
      </Modal>
    </>
  );
}

function DateChip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.quickChip} onPress={onPress}>
      <Text style={styles.quickText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: 62,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: 4,
  },
  label: {
    color: colors.mutedText,
    fontWeight: "800",
    fontSize: 12,
  },
  value: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 16,
  },
  placeholder: {
    color: colors.mutedText,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(17,20,23,0.2)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.appBackground,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  sheetTitle: {
    color: colors.whiteText,
    fontSize: 24,
    fontWeight: "900",
  },
  quickRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  quickChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickText: {
    color: colors.primaryGreen,
    fontWeight: "900",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  day: {
    width: "22.7%",
    minHeight: 70,
    borderRadius: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  daySelected: {
    backgroundColor: colors.primaryGreen,
    borderColor: colors.primaryGreen,
  },
  dayName: {
    color: colors.mutedText,
    fontWeight: "800",
    fontSize: 12,
  },
  dayNumber: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 21,
  },
  daySelectedText: {
    color: colors.card,
  },
});
