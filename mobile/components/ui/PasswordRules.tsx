import { StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { getPasswordRules } from "../../utils/passwordRules";

export function PasswordRules({ password }: { password: string }) {
  return (
    <View style={styles.wrap}>
      {getPasswordRules(password).map((rule) => (
        <View key={rule.key} style={styles.row}>
          <MaterialCommunityIcons
            name={rule.valid ? "check-circle" : "circle-outline"}
            size={16}
            color={rule.valid ? colors.primaryGreen : colors.mutedText}
          />
          <Text style={[styles.text, rule.valid && styles.valid]}>{rule.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minWidth: "45%",
  },
  text: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: "700",
  },
  valid: {
    color: colors.primaryGreen,
  },
});
