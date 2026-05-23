import { StyleSheet, Text, View } from "react-native";

import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";

type StatusBadgeProps = {
  label: string;
  tone?: "success" | "warning" | "danger" | "neutral";
};

export function StatusBadge({ label, tone = "neutral" }: StatusBadgeProps) {
  return (
    <View style={[styles.badge, styles[tone]]}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderWidth: 1,
  },
  success: {
    backgroundColor: "rgba(17,139,68,0.1)",
    borderColor: "rgba(17,139,68,0.25)",
  },
  warning: {
    backgroundColor: "rgba(255,176,32,0.12)",
    borderColor: "rgba(255,176,32,0.4)",
  },
  danger: {
    backgroundColor: "rgba(255,90,95,0.12)",
    borderColor: "rgba(255,90,95,0.4)",
  },
  neutral: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  text: {
    color: colors.whiteText,
    fontWeight: "800",
    fontSize: 12,
  },
});
