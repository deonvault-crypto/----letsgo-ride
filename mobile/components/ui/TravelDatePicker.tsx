import { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { AppButton } from "./AppButton";

type TravelDatePickerProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
};

const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function atNoon(date: Date) {
  const next = new Date(date);
  next.setHours(12, 0, 0, 0);
  return next;
}

function today() {
  return atNoon(new Date());
}

function toIsoDate(date: Date) {
  return atNoon(date).toISOString().slice(0, 10);
}

function addDays(days: number) {
  const date = today();
  date.setDate(date.getDate() + days);
  return date;
}

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0);
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1, 12, 0, 0, 0);
}

function formatDisplay(value: string) {
  if (!value) return "Select date";
  const date = new Date(`${value}T12:00:00`);
  return date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function sameDay(a: Date, b: Date) {
  return toIsoDate(a) === toIsoDate(b);
}

function isPast(date: Date) {
  return atNoon(date) < today();
}

function weekendDate() {
  const now = today();
  const daysUntilSaturday = (6 - now.getDay() + 7) % 7 || 7;
  return addDays(daysUntilSaturday);
}

export function TravelDatePicker({ label, value, onChangeText }: TravelDatePickerProps) {
  const selectedDate = value ? new Date(`${value}T12:00:00`) : null;
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(monthStart(selectedDate || today()));
  const cells = useMemo(() => buildMonthCells(visibleMonth), [visibleMonth]);
  const monthLabel = visibleMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const previousMonthDisabled = addMonths(visibleMonth, -1) < monthStart(today());

  function pick(date: Date) {
    if (isPast(date)) return;
    onChangeText(toIsoDate(date));
    setOpen(false);
  }

  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={label} style={styles.field} onPress={() => setOpen(true)}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.value, !value && styles.placeholder]}>{formatDisplay(value)}</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.headerRow}>
              <Text style={styles.sheetTitle}>Travel date</Text>
              <Pressable onPress={() => setOpen(false)} style={styles.closeButton}>
                <MaterialCommunityIcons name="close" size={20} color={colors.whiteText} />
              </Pressable>
            </View>
            <View style={styles.quickRow}>
              <DateChip label="Today" onPress={() => pick(addDays(0))} />
              <DateChip label="Tomorrow" onPress={() => pick(addDays(1))} />
              <DateChip label="This weekend" onPress={() => pick(weekendDate())} />
            </View>
            <View style={styles.monthCard}>
              <View style={styles.monthHeader}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Previous month"
                  disabled={previousMonthDisabled}
                  style={[styles.monthButton, previousMonthDisabled && styles.monthButtonDisabled]}
                  onPress={() => setVisibleMonth((current) => addMonths(current, -1))}
                >
                  <MaterialCommunityIcons name="chevron-left" size={24} color={previousMonthDisabled ? colors.border : colors.whiteText} />
                </Pressable>
                <Text style={styles.monthLabel}>{monthLabel}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Next month"
                  style={styles.monthButton}
                  onPress={() => setVisibleMonth((current) => addMonths(current, 1))}
                >
                  <MaterialCommunityIcons name="chevron-right" size={24} color={colors.whiteText} />
                </Pressable>
              </View>
              <View style={styles.weekRow}>
                {weekDays.map((day) => (
                  <Text key={day} style={styles.weekDay}>{day}</Text>
                ))}
              </View>
              <View style={styles.grid}>
                {cells.map((cell, index) => {
                  const disabled = !cell.inMonth || isPast(cell.date);
                  const selected = selectedDate ? sameDay(cell.date, selectedDate) : false;
                  return (
                    <Pressable
                      key={`${cell.iso}-${index}`}
                      accessibilityRole="button"
                      accessibilityLabel={cell.date.toLocaleDateString()}
                      disabled={disabled}
                      style={[styles.day, !cell.inMonth && styles.dayOutside, disabled && styles.dayDisabled, selected && styles.daySelected]}
                      onPress={() => pick(cell.date)}
                    >
                      <Text style={[styles.dayText, disabled && styles.dayTextDisabled, selected && styles.daySelectedText]}>
                        {cell.date.getDate()}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <AppButton title="Cancel" variant="ghost" onPress={() => setOpen(false)} />
          </View>
        </View>
      </Modal>
    </>
  );
}

function buildMonthCells(month: Date) {
  const start = monthStart(month);
  const firstGridDay = new Date(start);
  firstGridDay.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstGridDay);
    date.setDate(firstGridDay.getDate() + index);
    date.setHours(12, 0, 0, 0);
    return {
      date,
      iso: toIsoDate(date),
      inMonth: date.getMonth() === month.getMonth(),
    };
  });
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
    borderRadius: 22,
    backgroundColor: colors.elevated,
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
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sheetTitle: {
    color: colors.whiteText,
    fontSize: 24,
    fontWeight: "900",
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
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
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickText: {
    color: colors.primaryGreen,
    fontWeight: "900",
  },
  monthCard: {
    borderRadius: 28,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  monthButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  monthButtonDisabled: {
    opacity: 0.45,
  },
  monthLabel: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 18,
  },
  weekRow: {
    flexDirection: "row",
  },
  weekDay: {
    width: `${100 / 7}%`,
    textAlign: "center",
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: "900",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  day: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },
  dayOutside: {
    opacity: 0.38,
  },
  dayDisabled: {
    opacity: 0.28,
  },
  daySelected: {
    backgroundColor: colors.primaryGreen,
    opacity: 1,
  },
  dayText: {
    color: colors.whiteText,
    fontWeight: "900",
  },
  dayTextDisabled: {
    color: colors.mutedText,
  },
  daySelectedText: {
    color: colors.card,
  },
});
