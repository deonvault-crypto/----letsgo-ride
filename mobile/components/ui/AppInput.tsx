import { KeyboardTypeOptions, Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";

type AppInputProps = TextInputProps & {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: KeyboardTypeOptions;
  leftIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  rightIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  onPressRightIcon?: () => void;
};

export function AppInput({ label, style, leftIcon, rightIcon, onPressRightIcon, ...props }: AppInputProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputShell, style]}>
        {leftIcon ? <MaterialCommunityIcons name={leftIcon} size={20} color={colors.mutedText} /> : null}
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={colors.mutedText}
          style={styles.input}
          {...props}
        />
        {rightIcon ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`${label} action`} hitSlop={8} onPress={onPressRightIcon}>
            <MaterialCommunityIcons name={rightIcon} size={21} color={colors.mutedText} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  label: {
    color: colors.mutedText,
    fontWeight: "800",
    fontSize: 13,
    letterSpacing: 0,
  },
  inputShell: {
    minHeight: 54,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    backgroundColor: colors.elevated,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    color: colors.whiteText,
    fontSize: 15,
    letterSpacing: 0,
    paddingVertical: spacing.md,
  },
});
