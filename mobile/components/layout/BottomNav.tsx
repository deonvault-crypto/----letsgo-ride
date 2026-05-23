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

export function BottomNav({ role }: { role: NavRole }) {
  const router = useRouter();
  const pathname = usePathname();
  const items = role === "driver" ? driverItems : passengerItems;

  return (
    <View style={styles.wrap}>
      {items.map((item) => {
        const active = pathname.includes(item.href.replace("/(", "").replace(")", ""));
        return (
          <Pressable
            key={item.label}
            onPress={() => router.push(item.href as never)}
            style={styles.item}
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
    backgroundColor: "rgba(26,31,35,0.96)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    shadowColor: colors.black,
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  item: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minWidth: 58,
  },
  label: {
    color: colors.mutedText,
    fontSize: 11,
    fontWeight: "800",
  },
  activeLabel: {
    color: colors.whiteText,
  },
});
