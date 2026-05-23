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
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles[variant],
        (disabled || loading) && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? colors.card : colors.whiteText} />
      ) : (
        <View style={styles.content}>
          {icon}
          <Text style={[styles.text, variant === "primary" && styles.primaryText]}>
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
  },
  primary: {
    backgroundColor: colors.primaryGreen,
    borderColor: colors.primaryGreen,
  },
  secondary: {
    backgroundColor: colors.card,
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
    opacity: 0.5,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  text: {
    color: colors.whiteText,
    fontWeight: "800",
    fontSize: 15,
  },
  primaryText: {
    color: colors.card,
  },
});
