import { KeyboardTypeOptions, StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";

import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";

type AppInputProps = TextInputProps & {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: KeyboardTypeOptions;
};

export function AppInput({ label, style, ...props }: AppInputProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.mutedText}
        style={[styles.input, style]}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  label: {
    color: colors.mutedText,
    fontWeight: "700",
    fontSize: 13,
  },
  input: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    backgroundColor: colors.elevated,
    paddingHorizontal: spacing.lg,
    color: colors.whiteText,
    fontSize: 15,
  },
});
