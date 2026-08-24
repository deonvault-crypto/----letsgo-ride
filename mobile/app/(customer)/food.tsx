import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { FoodImage } from "../../components/food/FoodImage";
import { AppNotice } from "../../components/ui/AppNotice";
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
  const [restaurants, setRestaurants] = useState<Restaurant[] | null>(null);
  const restaurantsRef = useRef<Restaurant[] | null>(null);
  const requestGeneration = useRef(0);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [initialError, setInitialError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const generation = ++requestGeneration.current;
    const hasData = restaurantsRef.current !== null;
    if (hasData) {
      setRefreshing(true);
      setRefreshError(null);
    } else {
      setInitialLoading(true);
      setInitialError(null);
    }
    try {
      const next = await listRestaurants();
      if (generation !== requestGeneration.current) return;
      restaurantsRef.current = next;
      setRestaurants(next);
      setInitialError(null);
      setRefreshError(null);
    } catch (err) {
      if (generation !== requestGeneration.current) return;
      const message = err instanceof Error ? err.message : "Unable to load restaurants.";
      if (restaurantsRef.current !== null) setRefreshError("Couldn’t refresh restaurants.");
      else setInitialError(message);
    } finally {
      if (generation === requestGeneration.current) {
        setInitialLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (restaurants || []).filter((restaurant) => {
      const searchable = [restaurant.name, restaurant.description || "", ...(restaurant.cuisine_tags || [])].join(" ").toLowerCase();
      const categoryMatches = category === "All" || searchable.includes(category.toLowerCase());
      return categoryMatches && (!needle || searchable.includes(needle));
    });
  }, [category, query, restaurants]);

  const acceptingCount = restaurants?.filter((restaurant) => restaurant.is_orderable).length;
  const availabilityCopy = restaurants === null
    ? "Browse menus near you"
    : acceptingCount
      ? `${acceptingCount} accepting orders now`
      : "Check back for available menus";

  function openRestaurant(restaurant: Restaurant) {
    if (restaurant.is_orderable) router.push(`/(shared)/food/${restaurant.id}` as never);
  }

  return (
    <Screen title="Food" showBack fallbackRoute="/(customer)/home" navRole="customer" refreshing={refreshing} onRefresh={load}>
      <View style={styles.hero}>
        <FoodImage role="landing" label="A table of freshly prepared food" style={styles.heroPhoto} />
        <View style={styles.heroScrim} />
        <View style={styles.heroCopy}>
          <Text style={styles.heroTitle}>Craving something?</Text>
          <Text style={styles.heroBody}>Browse restaurants, explore menus and order from locations currently accepting orders.</Text>
          <Text style={styles.heroAvailability}>{availabilityCopy}</Text>
        </View>
      </View>

      <View style={styles.searchCard}>
        <MaterialCommunityIcons name="magnify" size={22} color={v2Theme.colors.inkSecondary} />
        <TextInput accessibilityLabel="Search restaurants or food" value={query} onChangeText={setQuery} placeholder="Search restaurants or food" placeholderTextColor={v2Theme.colors.inkTertiary} style={styles.searchInput} returnKeyType="search" />
        {query ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery("")} hitSlop={8}><MaterialCommunityIcons name="close-circle" size={20} color={v2Theme.colors.inkTertiary} /></Pressable> : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
        {categories.map(([icon, label]) => {
          const active = label === category;
          return <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => setCategory(label)} style={({ pressed }) => [styles.category, active && styles.categoryActive, pressed && styles.pressed]}><View style={[styles.categoryIcon, active && styles.categoryIconActive]}><MaterialCommunityIcons name={icon} size={21} color={active ? v2Theme.colors.brandStrong : v2Theme.colors.ink} /></View><Text style={[styles.categoryText, active && styles.categoryTextActive]}>{label}</Text></Pressable>;
        })}
      </ScrollView>

      {restaurants === null && initialLoading ? <RestaurantSkeleton /> : null}
      {restaurants === null && initialError ? <View style={styles.firstLoadError}><AppNotice title="Restaurants aren’t loading" message={initialError} actionLabel="Retry" onAction={load} /></View> : null}
      {restaurants !== null ? <AppNotice message={refreshError} actionLabel="Retry" onAction={load} onDismiss={() => setRefreshError(null)} autoDismissMs={4500} /> : null}

      {restaurants !== null ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View><Text style={styles.sectionTitle}>Restaurants</Text><Text style={styles.sectionSub}>{visible.length} available to browse</Text></View>
            {typeof acceptingCount === "number" && acceptingCount > 0 ? <Text style={styles.sectionBadge}>{acceptingCount} accepting orders</Text> : null}
          </View>
          {visible.map((restaurant) => <RestaurantCard key={restaurant.id} restaurant={restaurant} onPress={() => openRestaurant(restaurant)} />)}
          {visible.length === 0 ? <View style={styles.emptyCard}><MaterialCommunityIcons name="store-search-outline" size={28} color={v2Theme.colors.brandStrong} /><Text style={styles.emptyTitle}>{restaurants.length ? "No match" : "No restaurants available right now"}</Text><Text style={styles.emptyBody}>{restaurants.length ? "Try another restaurant name, food or category." : "Please check again shortly."}</Text></View> : null}
        </View>
      ) : null}

      {restaurants !== null ? <View style={styles.availabilityNote}><MaterialCommunityIcons name="clock-outline" size={20} color={v2Theme.colors.inkSecondary} /><Text style={styles.availabilityNoteText}>Restaurant availability can change with location, opening hours and current order volume.</Text></View> : null}
    </Screen>
  );
}

function RestaurantSkeleton() {
  return <View accessibilityLabel="Loading restaurants" style={styles.skeleton}><View style={styles.skeletonHeading} /><View style={styles.skeletonMedia} /><View style={styles.skeletonLineWide} /><View style={styles.skeletonLine} /></View>;
}

function RestaurantCard({ restaurant, onPress }: { restaurant: Restaurant; onPress: () => void }) {
  const orderable = Boolean(restaurant.is_orderable);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={restaurant.name} accessibilityState={{ disabled: !orderable }} disabled={!orderable} onPress={onPress} style={({ pressed }) => [styles.restaurantCard, !orderable && styles.restaurantCardUnavailable, pressed && orderable && styles.pressed]}>
      <View style={[styles.restaurantVisual, orderable ? styles.restaurantVisualOpen : styles.restaurantVisualUnavailable]}>
        <FoodImage uri={restaurant.hero_image_url} role="restaurant" label={restaurant.name} style={styles.restaurantPhoto} />
        {orderable ? <View style={styles.photoScrim} /> : null}
        <View style={styles.availabilityBadge}><Text style={styles.availabilityText}>{orderable ? "Accepting orders" : "Ordering unavailable"}</Text></View>
      </View>
      <View style={styles.restaurantInfo}>
        <View style={styles.restaurantNameRow}><Text numberOfLines={1} style={styles.restaurantName}>{restaurant.name}</Text><MaterialCommunityIcons name={orderable ? "chevron-right" : "clock-outline"} size={21} color={v2Theme.colors.inkTertiary} /></View>
        <Text numberOfLines={2} style={styles.restaurantDescription}>{restaurant.description || (orderable ? "Open for ordering" : "Ordering is not available right now")}</Text>
        <View style={styles.tags}>{restaurant.cuisine_tags?.slice(0, 3).map((tag) => <View key={tag} style={styles.tag}><Text style={styles.tagText}>{tag}</Text></View>)}</View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { position: "relative", overflow: "hidden", minHeight: 265, borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.ink, padding: 19, justifyContent: "flex-end" },
  heroPhoto: { ...StyleSheet.absoluteFillObject },
  heroScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(8,18,12,0.48)" },
  heroCopy: { gap: 7 },
  heroTitle: { color: "#FFFFFF", fontSize: 31, lineHeight: 35, fontWeight: "900", letterSpacing: -1 },
  heroBody: { color: "rgba(255,255,255,0.76)", fontSize: 12, lineHeight: 18, maxWidth: 330 },
  heroAvailability: { color: "#D5F6DF", fontSize: 10, fontWeight: "900", marginTop: 3 },
  searchCard: { minHeight: 58, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 10 },
  searchInput: { flex: 1, color: v2Theme.colors.ink, fontSize: 14, fontWeight: "700" },
  categoryRow: { gap: 8, paddingRight: 20 },
  category: { minWidth: 86, minHeight: 84, borderRadius: 20, backgroundColor: v2Theme.colors.surfaceMuted, padding: 10, justifyContent: "space-between", borderWidth: 1, borderColor: "transparent" },
  categoryActive: { backgroundColor: v2Theme.colors.brandSofter, borderColor: v2Theme.colors.brandSoft },
  categoryIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: v2Theme.colors.surface, alignItems: "center", justifyContent: "center" },
  categoryIconActive: { backgroundColor: v2Theme.colors.brandSoft },
  categoryText: { color: v2Theme.colors.ink, fontSize: 10, fontWeight: "900" },
  categoryTextActive: { color: v2Theme.colors.brandStrong },
  skeleton: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, padding: 14, gap: 10 },
  skeletonHeading: { width: "42%", height: 15, borderRadius: 8, backgroundColor: v2Theme.colors.surfaceMuted },
  skeletonMedia: { height: 118, borderRadius: 18, backgroundColor: v2Theme.colors.surfaceMuted },
  skeletonLineWide: { width: "76%", height: 11, borderRadius: 6, backgroundColor: v2Theme.colors.surfaceMuted },
  skeletonLine: { width: "52%", height: 10, borderRadius: 5, backgroundColor: v2Theme.colors.surfaceMuted },
  firstLoadError: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, padding: 8 },
  section: { gap: 11 },
  sectionHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 10 },
  sectionTitle: { color: v2Theme.colors.ink, fontSize: 20, fontWeight: "900" },
  sectionSub: { color: v2Theme.colors.inkSecondary, fontSize: 10, marginTop: 2 },
  sectionBadge: { color: v2Theme.colors.brandStrong, fontSize: 8, fontWeight: "900", letterSpacing: 0.4 },
  restaurantCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, overflow: "hidden" },
  restaurantCardUnavailable: { opacity: 0.84 },
  restaurantVisual: { height: 132, padding: 13, alignItems: "flex-end", justifyContent: "flex-end" },
  restaurantPhoto: { ...StyleSheet.absoluteFillObject },
  photoScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(9,25,17,0.18)" },
  restaurantVisualOpen: { backgroundColor: v2Theme.colors.brandSofter },
  restaurantVisualUnavailable: { backgroundColor: v2Theme.colors.surfaceMuted },
  availabilityBadge: { borderRadius: 12, backgroundColor: "rgba(255,255,255,0.94)", paddingHorizontal: 9, paddingVertical: 6 },
  availabilityText: { color: v2Theme.colors.ink, fontSize: 8, fontWeight: "900" },
  restaurantInfo: { padding: 14, gap: 7 },
  restaurantNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  restaurantName: { flex: 1, color: v2Theme.colors.ink, fontSize: 17, fontWeight: "900" },
  restaurantDescription: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  tag: { borderRadius: 10, backgroundColor: v2Theme.colors.surfaceMuted, paddingHorizontal: 7, paddingVertical: 4 },
  tagText: { color: v2Theme.colors.inkSecondary, fontSize: 8, fontWeight: "800" },
  emptyCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surfaceMuted, padding: 18, gap: 7, alignItems: "flex-start" },
  emptyTitle: { color: v2Theme.colors.ink, fontSize: 16, fontWeight: "900" },
  emptyBody: { color: v2Theme.colors.inkSecondary, fontSize: 11, lineHeight: 16 },
  availabilityNote: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surfaceMuted, padding: 14, flexDirection: "row", alignItems: "flex-start", gap: 10 },
  availabilityNoteText: { flex: 1, color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 16 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
});
