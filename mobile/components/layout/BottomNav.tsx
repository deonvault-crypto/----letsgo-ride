import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";

import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";

type NavRole = "passenger" | "driver";

const passengerItems = [
  { label: "Home", icon: "home-variant-outline", href: "/(passenger)/home" },
  { label: "Search", icon: "magnify", href: "/(passenger)/search" },
  { label: "Trips", icon: "ticket-confirmation-outline", href: "/(passenger)/my-trips" },
  { label: "Profile", icon: "account-outline", href: "/(shared)/profile" },
];

const driverItems = [
  { label: "Home", icon: "view-dashboard-outline", href: "/(driver)/home" },
  { label: "Post", icon: "plus-circle-outline", href: "/(driver)/post-trip" },
  { label: "Trips", icon: "steering", href: "/(driver)/trips" },
  { label: "Profile", icon: "account-outline", href: "/(shared)/profile" },
];

function navPath(href: string) {
  return href.replace("/(passenger)", "").replace("/(driver)", "").replace("/(shared)", "");
}

export function BottomNav({ role }: { role: NavRole }) {
  const router = useRouter();
  const pathname = usePathname();
  const items = role === "driver" ? driverItems : passengerItems;

  return (
    <View style={styles.wrap}>
      {items.map((item) => {
        const activePath = navPath(item.href);
        const active = pathname === activePath || pathname.endsWith(activePath);
        return (
          <Pressable
            key={item.label}
            onPress={() => router.push(item.href as never)}
            style={[styles.item, active && styles.activeItem]}
          >
            <MaterialCommunityIcons
              name={item.icon as never}
              size={22}
              color={active ? colors.primaryGreen : colors.mutedText}
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
    position: "absolute",
    left: spacing.screen,
    right: spacing.screen,
    bottom: 12,
    height: 66,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(255,253,248,0.96)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    shadowColor: colors.black,
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  item: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minWidth: 58,
    minHeight: 48,
    borderRadius: 18,
    paddingHorizontal: spacing.sm,
  },
  activeItem: {
    backgroundColor: "rgba(17,139,68,0.14)",
    borderWidth: 1,
    borderColor: "rgba(17,139,68,0.34)",
    shadowColor: colors.primaryGreen,
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  label: {
    color: colors.mutedText,
    fontSize: 11,
    fontWeight: "800",
  },
  activeLabel: {
    color: colors.primaryGreen,
  },
});
