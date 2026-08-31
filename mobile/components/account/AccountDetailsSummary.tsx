import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { v2Theme } from "../../constants/v2Theme";

export type AccountSummaryRow = {
  label: string;
  value: string;
};

type AccountDetailsSummaryProps = {
  rows: AccountSummaryRow[];
  note?: string;
  onEdit?: () => void;
  onRequestChange: () => void;
};

export function AccountDetailsSummary({ rows, note, onEdit, onRequestChange }: AccountDetailsSummaryProps) {
  return (
    <View accessibilityLabel="Saved account summary" style={styles.card} testID="saved-account-summary">
      <Text style={styles.title}>Account details</Text>
      <View style={styles.rows}>
        {rows.map((row, index) => (
          <View key={row.label} style={[styles.row, index === rows.length - 1 && styles.lastRow]}>
            <Text style={styles.label}>{row.label}</Text>
            <Text selectable style={styles.value}>{row.value || "Not added"}</Text>
          </View>
        ))}
      </View>
      {note ? <Text style={styles.note}>{note}</Text> : null}
      <View style={styles.actions}>
        {onEdit ? (
          <Pressable accessibilityRole="button" onPress={onEdit} style={({ pressed }) => [styles.editAction, pressed && styles.pressed]}>
            <MaterialCommunityIcons name="pencil-outline" size={17} color={v2Theme.colors.ink} />
            <Text style={styles.editText}>Edit contact & preferences</Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" onPress={onRequestChange} style={({ pressed }) => [styles.supportAction, pressed && styles.pressed]}>
          <Text style={styles.supportText}>Request a change</Text>
          <MaterialCommunityIcons name="arrow-right" size={17} color={v2Theme.colors.ink} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: v2Theme.radius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: v2Theme.colors.line,
    backgroundColor: v2Theme.colors.surface,
    padding: 15,
    gap: 12,
  },
  title: { color: v2Theme.colors.ink, fontSize: 18, fontWeight: "900", letterSpacing: -0.3 },
  rows: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: v2Theme.colors.line },
  row: { paddingVertical: 11, gap: 3, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: v2Theme.colors.line },
  lastRow: { borderBottomWidth: 0 },
  label: { color: v2Theme.colors.inkSecondary, fontSize: 9, fontWeight: "800" },
  value: { color: v2Theme.colors.ink, fontSize: 13, lineHeight: 18, fontWeight: "800" },
  note: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 16 },
  actions: { gap: 8 },
  editAction: { minHeight: 45, borderRadius: 15, backgroundColor: v2Theme.colors.surfaceMuted, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 12 },
  editText: { color: v2Theme.colors.ink, fontSize: 10, fontWeight: "900" },
  supportAction: { minHeight: 43, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 3 },
  supportText: { color: v2Theme.colors.ink, fontSize: 10, fontWeight: "900" },
  pressed: { opacity: 0.7 },
});
