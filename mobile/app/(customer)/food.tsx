import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";

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

  useEffect(() => { load(); }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return restaurants.filter((restaurant) => {
      const search = [restaurant.name, restaurant.description || "", ...(restaurant.cuisine_tags || [])].join(" ").toLowerCase();
      const categoryMatches = category === "All" || search.includes(category.toLowerCase());
      return categoryMatches && (!needle || search.includes(needle));
    });
  }, [restaurants, query, category]);

  const liveCount = restaurants.filter((restaurant) => restaurant.is_orderable).length;
  const comingSoonCount = restaurants.filter((restaurant) => restaurant.status === "COMING_SOON").length;

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
          <View style={styles.heroIcon}><MaterialCommunityIcons name="food-fork-drink" size={28} color="#FFFFFF" /></View>
          <View style={styles.heroBadge}><View style={styles.liveDot} /><Text style={styles.heroBadgeText}>FOOD MARKETPLACE</Text></View>
        </View>
        <Text style={styles.heroTitle}>Good food, without the guessing.</Text>
        <Text style={styles.heroBody}>Browse restaurants freely. Ordering only opens for restaurants that are actually enabled on LetsGoRide.</Text>
        <View style={styles.heroStats}>
          <HeroStat value={String(liveCount)} label="orderable now" />
          <HeroStat value={String(comingSoonCount)} label="coming soon" />
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
        />
        {query ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery("")}><MaterialCommunityIcons name="close-circle" size={20} color={v2Theme.colors.inkTertiary} /></Pressable> : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
        {categories.map(([icon, label]) => {
          const active = label === category;
          return (
            <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => setCategory(label)} style={({ pressed }) => [styles.category, active && styles.categoryActive, pressed && styles.pressed]}>
              <View style={[styles.categoryIcon, active && styles.categoryIconActive]}><MaterialCommunityIcons name={icon} size={21} color={active ? v2Theme.colors.brandStrong : v2Theme.colors.ink} /></View>
              <Text style={[styles.categoryText, active && styles.categoryTextActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.loadingCard}>
          <View style={styles.loadingIcon}><MaterialCommunityIcons name="store-search-outline" size={25} color={v2Theme.colors.brandStrong} /></View>
          <View style={styles.loadingCopy}><Text style={styles.loadingTitle}>Finding restaurants</Text><Text style={styles.loadingBody}>Checking the staging marketplace…</Text></View>
        </View>
      ) : null}

      {error ? (
        <Pressable accessibilityRole="button" onPress={load} style={styles.errorCard}>
          <MaterialCommunityIcons name="alert-circle-outline" size={22} color={v2Theme.colors.danger} />
          <View style={styles.loadingCopy}><Text style={styles.errorTitle}>Couldn’t load Food</Text><Text style={styles.loadingBody}>{error}</Text></View>
          <Text style={styles.retry}>Retry</Text>
        </Pressable>
      ) : null}

      {!loading && !error ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Restaurants</Text><Text style={styles.sectionSub}>{visible.length} shown</Text></View><Text style={styles.directoryLabel}>STAGING DIRECTORY</Text></View>
          {visible.map((restaurant) => <RestaurantCard key={restaurant.id} restaurant={restaurant} onPress={() => openRestaurant(restaurant)} />)}
          {visible.length === 0 ? <View style={styles.emptyCard}><MaterialCommunityIcons name="store-search-outline" size={28} color={v2Theme.colors.brandStrong} /><Text style={styles.emptyTitle}>No match</Text><Text style={styles.emptyBody}>Try another restaurant name or category.</Text></View> : null}
        </View>
      ) : null}

      <View style={styles.disclaimer}>
        <MaterialCommunityIcons name="shield-check-outline" size={21} color={v2Theme.colors.brandStrong} />
        <Text style={styles.disclaimerText}>“Coming soon” entries are directory previews only. They are not shown as LetsGoRide partners and cannot receive orders until a real merchant account is contracted and activated.</Text>
      </View>
    </Screen>
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return <View style={styles.heroStat}><Text style={styles.heroStatValue}>{value}</Text><Text style={styles.heroStatLabel}>{label}</Text></View>;
}

function RestaurantCard({ restaurant, onPress }: { restaurant: Restaurant; onPress: () => void }) {
  const orderable = Boolean(restaurant.is_orderable);
  const demo = Boolean(restaurant.demo_only);
  return (
    <Pressable accessibilityRole="button" disabled={!orderable} onPress={onPress} style={({ pressed }) => [styles.restaurantCard, !orderable && styles.restaurantCardSoon, pressed && orderable && styles.pressed]}>
      <View style={[styles.restaurantVisual, orderable ? styles.restaurantVisualLive : styles.restaurantVisualSoon]}>
        <View style={styles.restaurantGlyph}><MaterialCommunityIcons name={demo ? "chef-hat" : restaurant.cuisine_tags?.includes("Pizza") ? "pizza" : restaurant.cuisine_tags?.includes("Bakery") ? "bread-slice-outline" : "food-takeout-box-outline"} size={31} color={orderable ? "#FFFFFF" : v2Theme.colors.brandStrong} /></View>
        <View style={[styles.availabilityBadge, !orderable && styles.availabilityBadgeSoon]}><View style={[styles.availabilityDot, !orderable && styles.availabilityDotSoon]} /><Text style={styles.availabilityText}>{demo ? "DEMO · ORDERABLE" : orderable ? "ACCEPTING ORDERS" : "COMING SOON"}</Text></View>
      </View>
      <View style={styles.restaurantInfo}>
        <View style={styles.restaurantNameRow}><Text numberOfLines={1} style={styles.restaurantName}>{restaurant.name}</Text>{orderable ? <MaterialCommunityIcons name="chevron-right" size={22} color={v2Theme.colors.inkTertiary} /> : <MaterialCommunityIcons name="lock-outline" size={19} color={v2Theme.colors.inkTertiary} />}</View>
        <Text numberOfLines={2} style={styles.restaurantDescription}>{restaurant.description || (orderable ? "Open for ordering" : "Not yet available on LetsGoRide")}</Text>
        <View style={styles.tags}>{restaurant.cuisine_tags?.slice(0, 3).map((tag) => <View key={tag} style={styles.tag}><Text style={styles.tagText}>{tag}</Text></View>)}</View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { position: "relative", overflow: "hidden", minHeight: 270, borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.ink, padding: 19, justifyContent: "space-between", gap: 13 },
  heroGlowOne: { position: "absolute", width: 190, height: 190, borderRadius: 95, backgroundColor: "rgba(46,177,91,0.20)", right: -55, top: -65 },
  heroGlowTwo: { position: "absolute", width: 120, height: 120, borderRadius: 60, backgroundColor: "rgba(255,255,255,0.05)", right: 70, bottom: -60 },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroIcon: { width: 52, height: 52, borderRadius: 18, backgroundColor: v2Theme.colors.brand, alignItems: "center", justifyContent: "center" },
  heroBadge: { borderRadius: 999, backgroundColor: "rgba(255,255,255,0.09)", paddingHorizontal: 10, paddingVertical: 7, flexDirection: "row", alignItems: "center", gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#8FE6AE" },
  heroBadgeText: { color: "rgba(255,255,255,0.82)", fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  heroTitle: { color: "#FFFFFF", fontSize: 30, lineHeight: 34, fontWeight: "900", letterSpacing: -1 },
  heroBody: { color: "rgba(255,255,255,0.65)", fontSize: 12, lineHeight: 18, maxWidth: 330 },
  heroStats: { flexDirection: "row", gap: 8 },
  heroStat: { flex: 1, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.08)", padding: 11, gap: 2 },
  heroStatValue: { color: "#FFFFFF", fontSize: 20, fontWeight: "900" },
  heroStatLabel: { color: "rgba(255,255,255,0.48)", fontSize: 8, fontWeight: "800" },
  searchCard: { minHeight: 58, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 10 },
  searchInput: { flex: 1, color: v2Theme.colors.ink, fontSize: 14, fontWeight: "700" },
  categoryRow: { gap: 8, paddingRight: 20 },
  category: { minWidth: 86, minHeight: 84, borderRadius: 20, backgroundColor: v2Theme.colors.surfaceMuted, padding: 10, justifyContent: "space-between", borderWidth: 1, borderColor: "transparent" },
  categoryActive: { backgroundColor: v2Theme.colors.brandSofter, borderColor: v2Theme.colors.brandSoft },
  categoryIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: v2Theme.colors.surface, alignItems: "center", justifyContent: "center" },
  categoryIconActive: { backgroundColor: v2Theme.colors.brandSoft },
  categoryText: { color: v2Theme.colors.ink, fontSize: 10, fontWeight: "900" },
  categoryTextActive: { color: v2Theme.colors.brandStrong },
  loadingCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surfaceMuted, padding: 14, flexDirection: "row", alignItems: "center", gap: 11 },
  loadingIcon: { width: 45, height: 45, borderRadius: 15, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" },
  loadingCopy: { flex: 1, gap: 3 },
  loadingTitle: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900" },
  loadingBody: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15 },
  errorCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.dangerSoft, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  errorTitle: { color: v2Theme.colors.danger, fontSize: 12, fontWeight: "900" },
  retry: { color: v2Theme.colors.danger, fontSize: 10, fontWeight: "900" },
  section: { gap: 11 },
  sectionHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 10 },
  sectionTitle: { color: v2Theme.colors.ink, fontSize: 20, fontWeight: "900" },
  sectionSub: { color: v2Theme.colors.inkSecondary, fontSize: 10, marginTop: 2 },
  directoryLabel: { color: v2Theme.colors.brandStrong, fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
  restaurantCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, overflow: "hidden" },
  restaurantCardSoon: { opacity: 0.82 },
  restaurantVisual: { height: 115, padding: 13, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  restaurantVisualLive: { backgroundColor: v2Theme.colors.brand },
  restaurantVisualSoon: { backgroundColor: v2Theme.colors.brandSofter },
  restaurantGlyph: { width: 52, height: 52, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" },
  availabilityBadge: { borderRadius: 999, backgroundColor: "rgba(255,255,255,0.92)", paddingHorizontal: 9, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 5 },
  availabilityBadgeSoon: { backgroundColor: v2Theme.colors.surface },
  availabilityDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: v2Theme.colors.brand },
  availabilityDotSoon: { backgroundColor: v2Theme.colors.inkTertiary },
  availabilityText: { color: v2Theme.colors.ink, fontSize: 8, fontWeight: "900" },
  restaurantInfo: { padding: 14, gap: 7 },
  restaurantNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  restaurantName: { flex: 1, color: v2Theme.colors.ink, fontSize: 17, fontWeight: "900" },
  restaurantDescription: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  tag: { borderRadius: 999, backgroundColor: v2Theme.colors.surfaceMuted, paddingHorizontal: 7, paddingVertical: 4 },
  tagText: { color: v2Theme.colors.inkSecondary, fontSize: 8, fontWeight: "800" },
  emptyCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surfaceMuted, padding: 17, gap: 7 },
  emptyTitle: { color: v2Theme.colors.ink, fontSize: 15, fontWeight: "900" },
  emptyBody: { color: v2Theme.colors.inkSecondary, fontSize: 10 },
  disclaimer: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.brandSofter, padding: 13, flexDirection: "row", alignItems: "flex-start", gap: 9 },
  disclaimerText: { flex: 1, color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
});
