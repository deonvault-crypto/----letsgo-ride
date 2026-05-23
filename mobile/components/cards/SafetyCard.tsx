import { StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";

export function SafetyCard({ title, body, icon }: { title: string; body: string; icon: string }) {
  return (
    <View style={styles.card}>
      <MaterialCommunityIcons name={icon as never} size={22} color={colors.softGreen} />
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 20,
    padding: spacing.lg,
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: colors.whiteText,
    fontWeight: "900",
  },
  body: {
    color: colors.mutedText,
    lineHeight: 20,
  },
});
