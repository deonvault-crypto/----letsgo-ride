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
}> = [
  { key: "ride", label: "Ride", icon: "car-outline" },
  { key: "food", label: "Food", icon: "food-fork-drink" },
  { key: "courier", label: "Courier", icon: "package-variant-closed" },
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
              active && styles.activeItem,
              pressed && styles.pressed,
            ]}
          >
            <MaterialCommunityIcons
              name={item.icon}
              size={19}
              color={active ? v2Theme.colors.ink : v2Theme.colors.inkSecondary}
            />
            <Text style={[styles.label, active && styles.activeLabel]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minHeight: 58,
    borderRadius: v2Theme.radius.xl,
    backgroundColor: v2Theme.colors.surfaceMuted,
    padding: 5,
    flexDirection: "row",
    gap: 5,
  },
  item: {
    flex: 1,
    minHeight: 48,
    borderRadius: v2Theme.radius.lg,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
  },
  activeItem: {
    backgroundColor: v2Theme.colors.surface,
    shadowColor: v2Theme.colors.shadow,
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  pressed: {
    opacity: 0.72,
  },
  label: {
    color: v2Theme.colors.inkSecondary,
    fontSize: 13,
    fontWeight: "700",
  },
  activeLabel: {
    color: v2Theme.colors.ink,
    fontWeight: "900",
  },
});
