import { StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { AppButton } from "../ui/AppButton";

export function EmptyState({
  title,
  body,
  icon = "magnify-close",
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.state}>
      <View style={styles.iconWrap}>
        <MaterialCommunityIcons name={icon} size={28} color={colors.primaryGreen} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {actionLabel && onAction ? (
        <AppButton title={actionLabel} variant="secondary" onPress={onAction} style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  state: {
    minHeight: 172,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.xl,
  },
  iconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(17,139,68,0.1)",
  },
  title: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 18,
  },
  body: {
    color: colors.mutedText,
    textAlign: "center",
    lineHeight: 20,
  },
  action: {
    marginTop: spacing.sm,
  },
});
