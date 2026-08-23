import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";

import { v2Theme } from "../../constants/v2Theme";

const useSafePathname: typeof usePathname = typeof usePathname === "function" ? usePathname : (() => "");

export type NavRole = "customer" | "driver" | "courier" | "merchant";

type NavItem = {
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  activeIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  href: string;
  aliases?: string[];
};

const customerItems: NavItem[] = [
  { label: "Home", icon: "home-variant-outline", activeIcon: "home-variant", href: "/(customer)/home" },
  { label: "Services", icon: "view-grid-outline", activeIcon: "view-grid", href: "/(shared)/services" },
  { label: "Activity", icon: "clock-outline", activeIcon: "clock", href: "/(shared)/activity", aliases: ["/my-trips"] },
  { label: "Account", icon: "account-outline", activeIcon: "account", href: "/(shared)/account", aliases: ["/profile"] },
];

const driverItems: NavItem[] = [
  { label: "Home", icon: "view-dashboard-outline", activeIcon: "view-dashboard", href: "/(driver)/home" },
  { label: "Trips", icon: "steering", href: "/(driver)/trips" },
  { label: "Post", icon: "plus-circle-outline", activeIcon: "plus-circle", href: "/(driver)/post-trip" },
  { label: "Calendar", icon: "calendar-outline", activeIcon: "calendar", href: "/(driver)/availability" },
  { label: "Account", icon: "account-outline", activeIcon: "account", href: "/(driver)/account" },
];

const courierItems: NavItem[] = [
  { label: "Home", icon: "home-variant-outline", activeIcon: "home-variant", href: "/(courier)/home" },
  { label: "Offers", icon: "radar", href: "/(courier)/offers" },
  { label: "Schedule", icon: "calendar-outline", activeIcon: "calendar", href: "/(courier)/schedule" },
  { label: "Earnings", icon: "chart-line", href: "/(courier)/earnings" },
  { label: "Account", icon: "account-outline", activeIcon: "account", href: "/(courier)/account" },
];

const merchantItems: NavItem[] = [
  { label: "Orders", icon: "receipt-text-outline", activeIcon: "receipt-text", href: "/(merchant)/home" },
  { label: "Menu", icon: "food-fork-drink", href: "/(merchant)/menu" },
  { label: "Store", icon: "storefront-outline", activeIcon: "storefront", href: "/(merchant)/store" },
  { label: "Insights", icon: "chart-box-outline", activeIcon: "chart-box", href: "/(merchant)/insights" },
  { label: "Account", icon: "account-outline", activeIcon: "account", href: "/(merchant)/account" },
];

function navPath(href: string) {
  return href
    .replace("/(customer)", "")
    .replace("/(driver)", "")
    .replace("/(courier)", "")
    .replace("/(merchant)", "")
    .replace("/(shared)", "");
}

function isItemActive(pathname: string, item: NavItem) {
  const target = navPath(item.href);
  if (pathname === target || pathname.endsWith(target)) return true;
  return item.aliases?.some((alias) => pathname === alias || pathname.endsWith(alias)) ?? false;
}

export function BottomNav({ role }: { role: NavRole }) {
  const router = useRouter();
  const pathname = useSafePathname();
  const items = role === "driver" ? driverItems : role === "courier" ? courierItems : role === "merchant" ? merchantItems : customerItems;

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
              onPress={() => { if (!active) router.replace(item.href as never); }}
              style={({ pressed }) => [styles.item, active && styles.activeItem, pressed && styles.pressedItem]}
            >
              <MaterialCommunityIcons name={(active && item.activeIcon ? item.activeIcon : item.icon) as never} size={22} color={active ? v2Theme.colors.brand : v2Theme.colors.inkSecondary} />
              <Text numberOfLines={1} style={[styles.label, active && styles.activeLabel]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  positioner: { position: "absolute", left: v2Theme.spacing.page, right: v2Theme.spacing.page, bottom: 10 },
  wrap: { height: v2Theme.control.navHeight, borderRadius: v2Theme.radius.xxl, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, backgroundColor: "rgba(255,255,255,0.98)", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 7, paddingVertical: 7, shadowColor: v2Theme.colors.shadow, shadowOpacity: 0.1, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 10 },
  item: { flex: 1, minHeight: 56, borderRadius: 21, alignItems: "center", justifyContent: "center", gap: 3, paddingHorizontal: 4 },
  activeItem: { backgroundColor: v2Theme.colors.brandSoft },
  pressedItem: { opacity: 0.68 },
  label: { color: v2Theme.colors.inkSecondary, fontSize: 11, fontWeight: "700", letterSpacing: -0.1 },
  activeLabel: { color: v2Theme.colors.brandStrong, fontWeight: "800" },
});
