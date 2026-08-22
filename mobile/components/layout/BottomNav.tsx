import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";

import { v2Theme } from "../../constants/v2Theme";

type NavRole = "passenger" | "driver";

type NavItem = {
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  activeIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  href: string;
  aliases?: string[];
};

const passengerItems: NavItem[] = [
  {
    label: "Home",
    icon: "home-variant-outline",
    activeIcon: "home-variant",
    href: "/(passenger)/home",
  },
  {
    label: "Services",
    icon: "view-grid-outline",
    activeIcon: "view-grid",
    href: "/(shared)/services",
  },
  {
    label: "Activity",
    icon: "clock-outline",
    activeIcon: "clock",
    href: "/(shared)/activity",
    aliases: ["/my-trips"],
  },
  {
    label: "Account",
    icon: "account-outline",
    activeIcon: "account",
    href: "/(shared)/account",
    aliases: ["/profile"],
  },
];

const driverItems: NavItem[] = [
  {
    label: "Home",
    icon: "view-dashboard-outline",
    activeIcon: "view-dashboard",
    href: "/(driver)/home",
  },
  {
    label: "Post",
    icon: "plus-circle-outline",
    activeIcon: "plus-circle",
    href: "/(driver)/post-trip",
  },
  {
    label: "Trips",
    icon: "steering",
    href: "/(driver)/trips",
  },
  {
    label: "Account",
    icon: "account-outline",
    activeIcon: "account",
    href: "/(shared)/account",
    aliases: ["/profile"],
  },
];

function navPath(href: string) {
  return href
    .replace("/(passenger)", "")
    .replace("/(driver)", "")
    .replace("/(shared)", "");
}

function isItemActive(pathname: string, item: NavItem) {
  const target = navPath(item.href);
  if (pathname === target || pathname.endsWith(target)) return true;
  return item.aliases?.some((alias) => pathname === alias || pathname.endsWith(alias)) ?? false;
}

export function BottomNav({ role }: { role: NavRole }) {
  const router = useRouter();
  const pathname = usePathname();
  const items = role === "driver" ? driverItems : passengerItems;

  return (
    <View pointerEvents="box-none" style={styles.positioner}>
      <View style={styles.wrap}>
        {items.map((item) => {
          const active = isItemActive(pathname, item);
          return (
            <Pressable
              key={item.label}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={item.label}
              hitSlop={4}
              onPress={() => {
                if (!active) router.replace(item.href as never);
              }}
              style={({ pressed }) => [
                styles.item,
                active && styles.activeItem,
                pressed && styles.pressedItem,
              ]}
            >
              <MaterialCommunityIcons
                name={(active && item.activeIcon ? item.activeIcon : item.icon) as never}
                size={22}
                color={active ? v2Theme.colors.brand : v2Theme.colors.inkSecondary}
              />
              <Text numberOfLines={1} style={[styles.label, active && styles.activeLabel]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  positioner: {
    position: "absolute",
    left: v2Theme.spacing.page,
    right: v2Theme.spacing.page,
    bottom: 10,
  },
  wrap: {
    height: v2Theme.control.navHeight,
    borderRadius: v2Theme.radius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: v2Theme.colors.lineStrong,
    backgroundColor: "rgba(255,255,255,0.98)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 7,
    paddingVertical: 7,
    shadowColor: v2Theme.colors.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  item: {
    flex: 1,
    minHeight: 56,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: 4,
  },
  activeItem: {
    backgroundColor: v2Theme.colors.brandSoft,
  },
  pressedItem: {
    opacity: 0.68,
  },
  label: {
    color: v2Theme.colors.inkSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: -0.1,
  },
  activeLabel: {
    color: v2Theme.colors.brandStrong,
    fontWeight: "800",
  },
});
