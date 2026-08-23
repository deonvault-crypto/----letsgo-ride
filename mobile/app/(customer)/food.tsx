import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";

import { FoodImage } from "../../components/food/FoodImage";
import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";
import { listRestaurants } from "../../services/foodService";
import { Restaurant } from "../../types/food.types";

const categories = [
  ["silverware-fork-knife", "All"],
  ["food-drumstick", "Chicken"],
  ["pizza", "Pizza"],
  ["bread-slice-outline", "Bakery"],
  ["coffee-outline", "Café"],
] as const;

export default function CustomerFoodScreen() {
  const router = useRouter();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setError(null);
      setRestaurants(await listRestaurants());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load restaurants.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return restaurants.filter((restaurant) => {
      const searchable = [
        restaurant.name,
        restaurant.description || "",
        ...(restaurant.cuisine_tags || []),
      ]
        .join(" ")
        .toLowerCase();
      const categoryMatches = category === "All" || searchable.includes(category.toLowerCase());
      return categoryMatches && (!needle || searchable.includes(needle));
    });
  }, [restaurants, query, category]);

  const acceptingCount = restaurants.filter((restaurant) => restaurant.is_orderable).length;
  const otherCount = Math.max(0, restaurants.length - acceptingCount);

  function openRestaurant(restaurant: Restaurant) {
    if (!restaurant.is_orderable) return;
    router.push(`/(shared)/food/${restaurant.id}` as never);
  }

  return (
    <Screen title="Food" showBack fallbackRoute="/(customer)/home" navRole="customer">
      <View style={styles.hero}>
        <View style={styles.heroGlowOne} />
        <View style={styles.heroGlowTwo} />
        <View style={styles.heroTop}>
          <View style={styles.heroIcon}>
            <MaterialCommunityIcons name="food-fork-drink" size={28} color="#FFFFFF" />
          </View>
          <View style={styles.heroBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.heroBadgeText}>LETSGORIDE FOOD</Text>
          </View>
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.heroTitle}>Craving something?</Text>
          <Text style={styles.heroBody}>
            Browse restaurants, explore menus and order from locations currently accepting orders.
          </Text>
        </View>
        <View style={styles.heroStats}>
          <HeroStat value={String(acceptingCount)} label="accepting orders" />
          <HeroStat value={String(otherCount)} label="more restaurants" />
        </View>
      </View>

      <View style={styles.searchCard}>
        <MaterialCommunityIcons name="magnify" size={22} color={v2Theme.colors.inkSecondary} />
        <TextInput
          accessibilityLabel="Search restaurants or food"
          value={query}
          onChangeText={setQuery}
          placeholder="Search restaurants or food"
          placeholderTextColor={v2Theme.colors.inkTertiary}
          style={styles.searchInput}
          returnKeyType="search"
        />
        {query ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery("")} hitSlop={8}>
            <MaterialCommunityIcons name="close-circle" size={20} color={v2Theme.colors.inkTertiary} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
        {categories.map(([icon, label]) => {
          const active = label === category;
          return (
            <Pressable
              key={label}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setCategory(label)}
              style={({ pressed }) => [styles.category, active && styles.categoryActive, pressed && styles.pressed]}
            >
              <View style={[styles.categoryIcon, active && styles.categoryIconActive]}>
                <MaterialCommunityIcons name={icon} size={21} color={active ? v2Theme.colors.brandStrong : v2Theme.colors.ink} />
              </View>
              <Text style={[styles.categoryText, active && styles.categoryTextActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.stateCard}>
          <View style={styles.stateIcon}>
            <MaterialCommunityIcons name="store-search-outline" size={25} color={v2Theme.colors.brandStrong} />
          </View>
          <View style={styles.stateCopy}>
            <Text style={styles.stateTitle}>Finding restaurants</Text>
            <Text style={styles.stateBody}>Loading the latest restaurant availability…</Text>
          </View>
        </View>
      ) : null}

      {error ? (
        <Pressable accessibilityRole="button" onPress={load} style={styles.errorCard}>
          <MaterialCommunityIcons name="alert-circle-outline" size={22} color={v2Theme.colors.danger} />
          <View style={styles.stateCopy}>
            <Text style={styles.errorTitle}>Couldn’t load Food</Text>
            <Text style={styles.stateBody}>{error}</Text>
          </View>
          <Text style={styles.retry}>Retry</Text>
        </Pressable>
      ) : null}

      {!loading && !error ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Restaurants</Text>
              <Text style={styles.sectionSub}>{visible.length} available to browse</Text>
            </View>
            <Text style={styles.sectionBadge}>NEAR YOU</Text>
          </View>

          {visible.map((restaurant) => (
            <RestaurantCard
              key={restaurant.id}
              restaurant={restaurant}
              onPress={() => openRestaurant(restaurant)}
            />
          ))}

          {visible.length === 0 ? (
            <View style={styles.emptyCard}>
              <MaterialCommunityIcons name="store-search-outline" size={28} color={v2Theme.colors.brandStrong} />
              <Text style={styles.emptyTitle}>No match</Text>
              <Text style={styles.emptyBody}>Try another restaurant name, food or category.</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.availabilityNote}>
        <MaterialCommunityIcons name="clock-outline" size={20} color={v2Theme.colors.inkSecondary} />
        <Text style={styles.availabilityNoteText}>
          Restaurant availability can change with location, opening hours and current order volume.
        </Text>
      </View>
    </Screen>
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.heroStat}>
      <Text style={styles.heroStatValue}>{value}</Text>
      <Text style={styles.heroStatLabel}>{label}</Text>
    </View>
  );
}

function RestaurantCard({ restaurant, onPress }: { restaurant: Restaurant; onPress: () => void }) {
  const orderable = Boolean(restaurant.is_orderable);
  const icon = restaurant.cuisine_tags?.includes("Pizza")
    ? "pizza"
    : restaurant.cuisine_tags?.includes("Bakery")
      ? "bread-slice-outline"
      : restaurant.cuisine_tags?.includes("Chicken")
        ? "food-drumstick"
        : "food-takeout-box-outline";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={restaurant.name}
      accessibilityState={{ disabled: !orderable }}
      disabled={!orderable}
      onPress={onPress}
      style={({ pressed }) => [styles.restaurantCard, !orderable && styles.restaurantCardUnavailable, pressed && orderable && styles.pressed]}
    >
      <View style={[styles.restaurantVisual, orderable ? styles.restaurantVisualLive : styles.restaurantVisualUnavailable]}>
        <FoodImage uri={restaurant.hero_image_url} photographicFallback={orderable} label={restaurant.name} style={styles.restaurantPhoto} />
        {orderable ? <View style={styles.photoScrim} /> : null}
        {orderable ? <View style={styles.restaurantGlyph}><MaterialCommunityIcons name={icon} size={31} color="#FFFFFF" /></View> : <View />}
        <View style={[styles.availabilityBadge, !orderable && styles.availabilityBadgeUnavailable]}>
          <View style={[styles.availabilityDot, !orderable && styles.availabilityDotUnavailable]} />
          <Text style={styles.availabilityText}>{orderable ? "ACCEPTING ORDERS" : "ORDERING UNAVAILABLE"}</Text>
        </View>
      </View>

      <View style={styles.restaurantInfo}>
        <View style={styles.restaurantNameRow}>
          <Text numberOfLines={1} style={styles.restaurantName}>{restaurant.name}</Text>
          {orderable ? (
            <MaterialCommunityIcons name="chevron-right" size={22} color={v2Theme.colors.inkTertiary} />
          ) : (
            <MaterialCommunityIcons name="clock-outline" size={19} color={v2Theme.colors.inkTertiary} />
          )}
        </View>
        <Text numberOfLines={2} style={styles.restaurantDescription}>
          {restaurant.description || (orderable ? "Open for ordering" : "Ordering is not available right now")}
        </Text>
        <View style={styles.tags}>
          {restaurant.cuisine_tags?.slice(0, 3).map((tag) => (
            <View key={tag} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: {
    position: "relative",
    overflow: "hidden",
    minHeight: 265,
    borderRadius: v2Theme.radius.xxl,
    backgroundColor: v2Theme.colors.ink,
    padding: 19,
    justifyContent: "space-between",
    gap: 13,
  },
  heroGlowOne: {
    position: "absolute",
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: "rgba(46,177,91,0.20)",
    right: -55,
    top: -65,
  },
  heroGlowTwo: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.05)",
    right: 70,
    bottom: -60,
  },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: v2Theme.colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  heroBadge: {
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.09)",
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#8FE6AE" },
  heroBadgeText: { color: "rgba(255,255,255,0.82)", fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  heroCopy: { gap: 7 },
  heroTitle: { color: "#FFFFFF", fontSize: 31, lineHeight: 35, fontWeight: "900", letterSpacing: -1 },
  heroBody: { color: "rgba(255,255,255,0.66)", fontSize: 12, lineHeight: 18, maxWidth: 330 },
  heroStats: { flexDirection: "row", gap: 8 },
  heroStat: { flex: 1, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.08)", padding: 11, gap: 2 },
  heroStatValue: { color: "#FFFFFF", fontSize: 20, fontWeight: "900" },
  heroStatLabel: { color: "rgba(255,255,255,0.50)", fontSize: 8, fontWeight: "800" },
  searchCard: {
    minHeight: 58,
    borderRadius: v2Theme.radius.xl,
    backgroundColor: v2Theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: v2Theme.colors.line,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchInput: { flex: 1, color: v2Theme.colors.ink, fontSize: 14, fontWeight: "700" },
  categoryRow: { gap: 8, paddingRight: 20 },
  category: {
    minWidth: 86,
    minHeight: 84,
    borderRadius: 20,
    backgroundColor: v2Theme.colors.surfaceMuted,
    padding: 10,
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "transparent",
  },
  categoryActive: { backgroundColor: v2Theme.colors.brandSofter, borderColor: v2Theme.colors.brandSoft },
  categoryIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: v2Theme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryIconActive: { backgroundColor: v2Theme.colors.brandSoft },
  categoryText: { color: v2Theme.colors.ink, fontSize: 10, fontWeight: "900" },
  categoryTextActive: { color: v2Theme.colors.brandStrong },
  stateCard: {
    borderRadius: v2Theme.radius.xl,
    backgroundColor: v2Theme.colors.surfaceMuted,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  stateIcon: {
    width: 45,
    height: 45,
    borderRadius: 15,
    backgroundColor: v2Theme.colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  stateCopy: { flex: 1, gap: 3 },
  stateTitle: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900" },
  stateBody: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15 },
  errorCard: {
    borderRadius: v2Theme.radius.xl,
    backgroundColor: v2Theme.colors.dangerSoft,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  errorTitle: { color: v2Theme.colors.danger, fontSize: 12, fontWeight: "900" },
  retry: { color: v2Theme.colors.danger, fontSize: 10, fontWeight: "900" },
  section: { gap: 11 },
  sectionHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 10 },
  sectionTitle: { color: v2Theme.colors.ink, fontSize: 20, fontWeight: "900" },
  sectionSub: { color: v2Theme.colors.inkSecondary, fontSize: 10, marginTop: 2 },
  sectionBadge: { color: v2Theme.colors.brandStrong, fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
  restaurantCard: {
    borderRadius: v2Theme.radius.xxl,
    backgroundColor: v2Theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: v2Theme.colors.line,
    overflow: "hidden",
  },
  restaurantCardUnavailable: { opacity: 0.84 },
  restaurantVisual: {
    height: 115,
    padding: 13,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  restaurantPhoto: { ...StyleSheet.absoluteFillObject },
  photoScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(9,25,17,0.23)" },
  restaurantVisualLive: { backgroundColor: v2Theme.colors.brand },
  restaurantVisualUnavailable: { backgroundColor: v2Theme.colors.brandSofter },
  restaurantGlyph: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  availabilityBadge: {
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.94)",
    paddingHorizontal: 9,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  availabilityBadgeUnavailable: { backgroundColor: v2Theme.colors.surface },
  availabilityDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: v2Theme.colors.brand },
  availabilityDotUnavailable: { backgroundColor: v2Theme.colors.inkTertiary },
  availabilityText: { color: v2Theme.colors.ink, fontSize: 8, fontWeight: "900" },
  restaurantInfo: { padding: 14, gap: 7 },
  restaurantNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  restaurantName: { flex: 1, color: v2Theme.colors.ink, fontSize: 17, fontWeight: "900" },
  restaurantDescription: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  tag: { borderRadius: 999, backgroundColor: v2Theme.colors.surfaceMuted, paddingHorizontal: 7, paddingVertical: 4 },
  tagText: { color: v2Theme.colors.inkSecondary, fontSize: 8, fontWeight: "800" },
  emptyCard: {
    borderRadius: v2Theme.radius.xl,
    backgroundColor: v2Theme.colors.surfaceMuted,
    padding: 18,
    gap: 7,
    alignItems: "flex-start",
  },
  emptyTitle: { color: v2Theme.colors.ink, fontSize: 16, fontWeight: "900" },
  emptyBody: { color: v2Theme.colors.inkSecondary, fontSize: 11, lineHeight: 16 },
  availabilityNote: {
    borderRadius: v2Theme.radius.xl,
    backgroundColor: v2Theme.colors.surfaceMuted,
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  availabilityNoteText: { flex: 1, color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 16 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
});
