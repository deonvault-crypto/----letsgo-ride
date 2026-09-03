import { ReactNode, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";

import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { useMotionSettings } from "../../hooks/useMotionSettings";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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
  const { canAnimate } = useMotionSettings();
  const [pressed, setPressed] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const indicatorColor = variant === "primary" ? colors.card : variant === "danger" ? colors.danger : colors.whiteText;

  useEffect(() => {
    if (!canAnimate || isDisabled) {
      scale.setValue(1);
      setPressed(false);
      return;
    }
    const animation = Animated.timing(scale, {
      toValue: pressed ? 0.985 : 1,
      duration: pressed ? 90 : 140,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
      isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [canAnimate, isDisabled, pressed, scale]);

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: Boolean(loading) }}
      disabled={isDisabled}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[
        styles.button,
        styles[variant],
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        { transform: [{ scale: canAnimate && !isDisabled ? scale : 1 }] },
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? <ActivityIndicator size="small" color={indicatorColor} animating={canAnimate} hidesWhenStopped={false} /> : icon}
        <Text style={[
          styles.text,
          variant === "primary" && styles.primaryText,
          variant === "danger" && styles.dangerText,
          isDisabled && styles.disabledText,
        ]}>
          {title}
        </Text>
      </View>
    </AnimatedPressable>
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
    opacity: 0.85,
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
