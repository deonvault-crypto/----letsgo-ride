import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";

const categories = [
  ["silverware-fork-knife", "Restaurants"],
  ["hamburger", "Burgers"],
  ["food-drumstick", "Chicken"],
  ["pizza", "Pizza"],
  ["coffee-outline", "Cafés"],
] as const;

export default function FoodScreen() {
  const router = useRouter();

  return (
    <Screen showBack fallbackRoute="/(passenger)/home" title="Food" showNotifications={false}>
      <View style={styles.hero}>
        <Text style={styles.title}>Food, without the friction.</Text>
        <Text style={styles.body}>Browse nearby restaurants, build your order and follow delivery from kitchen to door.</Text>
      </View>

      <Pressable accessibilityRole="search" style={styles.search}>
        <MaterialCommunityIcons name="magnify" size={22} color={v2Theme.colors.inkSecondary} />
        <Text style={styles.searchText}>Search restaurants or dishes</Text>
      </Pressable>

      <View style={styles.locationCard}>
        <View style={styles.locationIcon}>
          <MaterialCommunityIcons name="map-marker-outline" size={22} color={v2Theme.colors.brandStrong} />
        </View>
        <View style={styles.locationCopy}>
          <Text style={styles.locationLabel}>Delivery location</Text>
          <Text style={styles.locationValue}>Choose your delivery address</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={v2Theme.colors.inkTertiary} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Browse by category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
          {categories.map(([icon, label]) => (
            <View key={label} style={styles.categoryCard}>
              <View style={styles.categoryIcon}>
                <MaterialCommunityIcons name={icon} size={23} color={v2Theme.colors.ink} />
              </View>
              <Text style={styles.categoryLabel}>{label}</Text>
            </View>
          ))}
        </ScrollView>
      </View>

      <View style={styles.marketState}>
        <View style={styles.marketIcon}>
          <MaterialCommunityIcons name="storefront-outline" size={30} color={v2Theme.colors.brandStrong} />
        </View>
        <Text style={styles.marketTitle}>Restaurant marketplace</Text>
        <Text style={styles.marketBody}>
          Restaurant listings will be populated from the merchant system, so this screen never relies on fake production data.
        </Text>
        <Pressable onPress={() => router.replace("/(shared)/services" as never)} hitSlop={8}>
          <Text style={styles.action}>Explore other services</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 7 },
  title: {
    color: v2Theme.colors.ink,
    fontSize: 32,
    lineHeight: 37,
    fontWeight: "900",
    letterSpacing: -1.05,
  },
  body: {
    color: v2Theme.colors.inkSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  search: {
    minHeight: 58,
    borderRadius: v2Theme.radius.xl,
    backgroundColor: v2Theme.colors.surfaceMuted,
    paddingHorizontal: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  searchText: {
    color: v2Theme.colors.inkSecondary,
    fontSize: 15,
    fontWeight: "700",
  },
  locationCard: {
    minHeight: 76,
    borderRadius: v2Theme.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: v2Theme.colors.line,
    backgroundColor: v2Theme.colors.surface,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  locationIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: v2Theme.colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  locationCopy: { flex: 1, gap: 3 },
  locationLabel: {
    color: v2Theme.colors.inkSecondary,
    fontSize: 11,
    fontWeight: "800",
  },
  locationValue: {
    color: v2Theme.colors.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  section: { gap: 12 },
  sectionTitle: {
    color: v2Theme.colors.ink,
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  categoryRow: { gap: 10, paddingRight: 20 },
  categoryCard: {
    width: 92,
    minHeight: 104,
    borderRadius: v2Theme.radius.xl,
    backgroundColor: v2Theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: v2Theme.colors.line,
    padding: 11,
    justifyContent: "space-between",
  },
  categoryIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: v2Theme.colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryLabel: {
    color: v2Theme.colors.ink,
    fontSize: 12,
    fontWeight: "900",
  },
  marketState: {
    borderRadius: v2Theme.radius.xxl,
    backgroundColor: v2Theme.colors.brandSofter,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#DCEFE3",
    padding: 20,
    gap: 10,
  },
  marketIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: v2Theme.colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  marketTitle: {
    color: v2Theme.colors.ink,
    fontSize: 19,
    fontWeight: "900",
  },
  marketBody: {
    color: v2Theme.colors.inkSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  action: {
    color: v2Theme.colors.brandStrong,
    fontSize: 13,
    fontWeight: "900",
    paddingTop: 3,
  },
});
