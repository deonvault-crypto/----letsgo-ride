import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <View style={styles.state}>
      <ActivityIndicator color={colors.primaryGreen} />
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  state: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  text: {
    color: colors.mutedText,
    fontWeight: "700",
  },
});
