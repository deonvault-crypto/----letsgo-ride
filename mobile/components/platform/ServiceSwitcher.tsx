import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { v2Theme } from "../../constants/v2Theme";

export type CustomerService = "ride" | "food" | "courier";

type ServiceSwitcherProps = {
  value: CustomerService;
  onChange: (service: CustomerService) => void;
};

const items: Array<{
  key: CustomerService;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  accent: string;
  background: string;
  activeBackground: string;
  iconBackground: string;
  border: string;
}> = [
  { key: "ride", label: "Ride", icon: "car-outline", accent: "#157A45", background: "#F1F8F3", activeBackground: "#E5F5EA", iconBackground: "#D5EFDE", border: "#BDE2CA" },
  { key: "food", label: "Food", icon: "food-fork-drink", accent: "#B65E16", background: "#FFF8ED", activeBackground: "#FFF0DA", iconBackground: "#FFE3B9", border: "#F3CFA0" },
  { key: "courier", label: "Courier", icon: "package-variant-closed", accent: "#2E68A2", background: "#F2F7FD", activeBackground: "#E7F1FD", iconBackground: "#D9E8FA", border: "#C2D8F1" },
];

export function ServiceSwitcher({ value, onChange }: ServiceSwitcherProps) {
  return (
    <View accessibilityRole="tablist" style={styles.wrap}>
      {items.map((item) => {
        const active = item.key === value;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(item.key)}
            style={({ pressed }) => [
              styles.item,
              { backgroundColor: active ? item.activeBackground : item.background, borderColor: active ? item.border : "transparent" },
              active && styles.activeItem,
              pressed && styles.pressed,
            ]}
          >
            <View style={[styles.iconBadge, { backgroundColor: item.iconBackground }]}>
              <MaterialCommunityIcons name={item.icon} size={19} color={item.accent} />
            </View>
            <Text style={[styles.label, active && styles.activeLabel, active && { color: item.accent }]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { minHeight: 58, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surfaceMuted, padding: 5, flexDirection: "row", gap: 5 },
  item: { flex: 1, minHeight: 48, borderRadius: v2Theme.radius.lg, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 },
  activeItem: { shadowColor: v2Theme.colors.shadow, shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  iconBadge: { width: 30, height: 30, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.72 },
  label: { color: v2Theme.colors.inkSecondary, fontSize: 13, fontWeight: "800" },
  activeLabel: { fontWeight: "900" },
});
