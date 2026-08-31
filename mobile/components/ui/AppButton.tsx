import { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";

import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";

type AppButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function AppButton({
  title,
  onPress,
  variant = "primary",
  disabled,
  loading,
  icon,
  style,
}: AppButtonProps) {
  const isDisabled = Boolean(disabled || loading);
  const indicatorColor = variant === "primary" ? colors.card : variant === "danger" ? colors.danger : colors.whiteText;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: Boolean(loading) }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles[variant],
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? <ActivityIndicator size="small" color={indicatorColor} /> : icon}
        <Text style={[
          styles.text,
          variant === "primary" && styles.primaryText,
          variant === "danger" && styles.dangerText,
          isDisabled && styles.disabledText,
        ]}>
          {title}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 54,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
  },
  primary: {
    backgroundColor: colors.charcoal,
    borderColor: colors.charcoal,
    shadowColor: colors.black,
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  secondary: {
    backgroundColor: colors.elevated,
    borderColor: colors.border,
  },
  ghost: {
    backgroundColor: "transparent",
    borderColor: colors.border,
  },
  danger: {
    backgroundColor: "rgba(255,90,95,0.14)",
    borderColor: "rgba(255,90,95,0.35)",
  },
  disabled: {
    opacity: 1,
    backgroundColor: "#E6E0D5",
    borderColor: "#D8CEC0",
  },
  pressed: {
    transform: [{ scale: 0.985 }],
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  text: {
    color: colors.whiteText,
    fontWeight: "800",
    fontSize: 15,
    letterSpacing: 0,
  },
  primaryText: {
    color: colors.card,
  },
  dangerText: {
    color: colors.danger,
  },
  disabledText: {
    color: "#7A7064",
  },
});
