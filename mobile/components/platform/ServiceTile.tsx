import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { v2Theme } from "../../constants/v2Theme";

type ServiceTileProps = {
  title: string;
  subtitle?: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: () => void;
  tone?: "neutral" | "brand";
  disabled?: boolean;
  badge?: string;
};

export function ServiceTile({
  title,
  subtitle,
  icon,
  onPress,
  tone = "neutral",
  disabled = false,
  badge,
}: ServiceTileProps) {
  const branded = tone === "brand";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        branded && styles.brandCard,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <View style={[styles.iconWrap, branded && styles.brandIconWrap]}>
        <MaterialCommunityIcons
          name={icon}
          size={26}
          color={branded ? v2Theme.colors.brandStrong : v2Theme.colors.ink}
        />
      </View>
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={styles.title}>{title}</Text>
          {badge ? <Text style={styles.badge}>{badge}</Text> : null}
        </View>
        {subtitle ? <Text numberOfLines={2} style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <MaterialCommunityIcons name="chevron-right" size={22} color={v2Theme.colors.inkTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 92,
    borderRadius: v2Theme.radius.xl,
    backgroundColor: v2Theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: v2Theme.colors.line,
    padding: v2Theme.spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: v2Theme.spacing.md,
  },
  brandCard: {
    backgroundColor: v2Theme.colors.brandSofter,
    borderColor: "#DCEFE3",
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: v2Theme.radius.lg,
    backgroundColor: v2Theme.colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  brandIconWrap: {
    backgroundColor: v2Theme.colors.brandSoft,
  },
  copy: {
    flex: 1,
    gap: 5,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    color: v2Theme.colors.ink,
    fontSize: v2Theme.type.card,
    fontWeight: "900",
    letterSpacing: -0.25,
  },
  subtitle: {
    color: v2Theme.colors.inkSecondary,
    fontSize: v2Theme.type.supporting,
    lineHeight: 18,
  },
  badge: {
    color: v2Theme.colors.brandStrong,
    backgroundColor: v2Theme.colors.brandSoft,
    borderRadius: v2Theme.radius.pill,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 10,
    fontWeight: "900",
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    transform: [{ scale: 0.99 }],
    opacity: 0.8,
  },
});
