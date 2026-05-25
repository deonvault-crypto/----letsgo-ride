import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";

type ListTileProps = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  danger?: boolean;
};

export function ListTile({ icon, title, subtitle, onPress, danger = false }: ListTileProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
    >
      <View style={[styles.iconWrap, danger && styles.dangerIcon]}>
        <MaterialCommunityIcons
          name={icon}
          size={21}
          color={danger ? colors.danger : colors.primaryGreen}
        />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, danger && styles.dangerText]}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <MaterialCommunityIcons name="chevron-right" size={22} color={colors.mutedText} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: 22,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: {
    transform: [{ scale: 0.99 }],
    backgroundColor: "#F8F3EA",
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(17,139,68,0.11)",
  },
  dangerIcon: {
    backgroundColor: "rgba(255,90,95,0.12)",
  },
  copy: {
    flex: 1,
    gap: 3,
  },
  title: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 15,
    letterSpacing: 0,
  },
  dangerText: {
    color: colors.danger,
  },
  subtitle: {
    color: colors.mutedText,
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: 0,
  },
});
