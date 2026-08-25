import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { FoodImage } from "../../components/food/FoodImage";
import { AppNotice } from "../../components/ui/AppNotice";
import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";
import { officialDirectoryLogos } from "../../constants/foodDirectoryAssets";
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
  const orderableRestaurants = visible.filter((restaurant) => restaurant.is_orderable);
  const browseOnlyRestaurants = visible.filter((restaurant) => !restaurant.is_orderable);
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
            <View><Text style={styles.sectionTitle}>Restaurants</Text><Text style={styles.sectionSub}>{visible.length} places to explore</Text></View>
            {typeof acceptingCount === "number" && acceptingCount > 0 ? <Text style={styles.sectionBadge}>{acceptingCount} accepting orders</Text> : null}
          </View>
          {orderableRestaurants.length ? (
            <View style={styles.restaurantTier}>
              <Text style={styles.tierLabel}>AVAILABLE NOW</Text>
              {orderableRestaurants.map((restaurant) => <OrderableRestaurantCard key={restaurant.id} restaurant={restaurant} onPress={() => openRestaurant(restaurant)} />)}
            </View>
          ) : null}
          {browseOnlyRestaurants.length ? (
            <View style={styles.restaurantTier}>
              <Text style={styles.tierLabel}>MORE IN ZIMBABWE</Text>
              {browseOnlyRestaurants.map((restaurant) => <BrowseOnlyRestaurantCard key={restaurant.id} restaurant={restaurant} />)}
            </View>
          ) : null}
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

function OrderableRestaurantCard({ restaurant, onPress }: { restaurant: Restaurant; onPress: () => void }) {
  return (
    <Pressable testID={`orderable-restaurant-${restaurant.id}`} accessibilityRole="button" accessibilityLabel={`${restaurant.name}, accepting orders`} onPress={onPress} style={({ pressed }) => [styles.orderableCard, pressed && styles.pressed]}>
      <View style={styles.orderableVisual}>
        <FoodImage uri={restaurant.hero_image_url} role="restaurant" label={restaurant.name} style={styles.restaurantPhoto} />
        <View style={styles.photoScrim} />
        <View style={styles.acceptingBadge}><View style={styles.acceptingDot} /><Text style={styles.acceptingText}>Accepting orders</Text></View>
      </View>
      <View style={styles.orderableInfo}>
        <View style={styles.restaurantNameRow}><Text numberOfLines={1} style={styles.orderableName}>{restaurant.name}</Text><MaterialCommunityIcons name="chevron-right" size={22} color={v2Theme.colors.inkSecondary} /></View>
        <Text numberOfLines={2} style={styles.orderableDescription}>{restaurant.description || "Open for ordering"}</Text>
        <CuisineTags tags={restaurant.cuisine_tags} emphasized />
      </View>
    </Pressable>
  );
}

function BrowseOnlyRestaurantCard({ restaurant }: { restaurant: Restaurant }) {
  const officialLogo = officialDirectoryLogos[restaurant.id];
  return (
    <View testID={`browse-restaurant-${restaurant.id}`} accessibilityLabel={`${restaurant.name}, currently unavailable`} style={styles.browseCard}>
      <View style={styles.logoFrame}>
        <FoodImage source={officialLogo?.image} uri={officialLogo ? null : restaurant.logo_url} role="logo" label={`${restaurant.name} logo`} style={styles.logoImage} />
      </View>
      <View style={styles.browseCopy}>
        <Text numberOfLines={1} style={styles.browseName}>{restaurant.name}</Text>
        <Text numberOfLines={1} style={styles.browseDescription}>{restaurant.description || "Restaurant directory listing"}</Text>
        <CuisineTags tags={restaurant.cuisine_tags} />
        <View style={styles.unavailableStatus}><MaterialCommunityIcons name="clock-outline" size={14} color={v2Theme.colors.inkSecondary} /><Text style={styles.unavailableText}>Currently unavailable</Text></View>
      </View>
    </View>
  );
}

function CuisineTags({ tags, emphasized = false }: { tags?: string[]; emphasized?: boolean }) {
  return <View style={styles.tags}>{tags?.slice(0, 2).map((tag) => <View key={tag} style={[styles.tag, emphasized && styles.tagEmphasized]}><Text style={[styles.tagText, emphasized && styles.tagTextEmphasized]}>{tag}</Text></View>)}</View>;
}

const styles = StyleSheet.create({
  hero: { position: "relative", overflow: "hidden", minHeight: 218, borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.ink, padding: 18, justifyContent: "flex-end" },
  heroPhoto: { ...StyleSheet.absoluteFillObject },
  heroScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(8,18,12,0.48)" },
  heroCopy: { gap: 7 },
  heroTitle: { color: "#FFFFFF", fontSize: 29, lineHeight: 33, fontWeight: "900", letterSpacing: -0.8 },
  heroBody: { color: "rgba(255,255,255,0.82)", fontSize: 12, lineHeight: 17, maxWidth: 320 },
  heroAvailability: { color: "#D5F6DF", fontSize: 10, fontWeight: "900", marginTop: 3 },
  searchCard: { minHeight: 54, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 10 },
  searchInput: { flex: 1, color: v2Theme.colors.ink, fontSize: 14, fontWeight: "700" },
  categoryRow: { gap: 8, paddingRight: 20 },
  category: { minWidth: 82, minHeight: 72, borderRadius: 18, backgroundColor: "#F0F1ED", paddingHorizontal: 10, paddingVertical: 8, justifyContent: "space-between", borderWidth: 1, borderColor: v2Theme.colors.line },
  categoryActive: { backgroundColor: v2Theme.colors.brandSofter, borderColor: v2Theme.colors.brandSoft },
  categoryIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: v2Theme.colors.surface, alignItems: "center", justifyContent: "center" },
  categoryIconActive: { backgroundColor: v2Theme.colors.brandSoft },
  categoryText: { color: v2Theme.colors.ink, fontSize: 10, fontWeight: "900" },
  categoryTextActive: { color: v2Theme.colors.brandStrong },
  skeleton: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, padding: 14, gap: 10 },
  skeletonHeading: { width: "42%", height: 15, borderRadius: 8, backgroundColor: v2Theme.colors.surfaceMuted },
  skeletonMedia: { height: 118, borderRadius: 18, backgroundColor: v2Theme.colors.surfaceMuted },
  skeletonLineWide: { width: "76%", height: 11, borderRadius: 6, backgroundColor: v2Theme.colors.surfaceMuted },
  skeletonLine: { width: "52%", height: 10, borderRadius: 5, backgroundColor: v2Theme.colors.surfaceMuted },
  firstLoadError: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, padding: 8 },
  section: { gap: 16 },
  sectionHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 10 },
  sectionTitle: { color: v2Theme.colors.ink, fontSize: 20, fontWeight: "900" },
  sectionSub: { color: v2Theme.colors.inkSecondary, fontSize: 10, marginTop: 2 },
  sectionBadge: { color: v2Theme.colors.brandStrong, fontSize: 8, fontWeight: "900", letterSpacing: 0.4 },
  restaurantTier: { gap: 10 },
  tierLabel: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 14, fontWeight: "900", letterSpacing: 1.1 },
  orderableCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, overflow: "hidden", shadowColor: v2Theme.colors.shadow, shadowOpacity: 0.06, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  orderableVisual: { height: 148, padding: 12, alignItems: "flex-start", justifyContent: "flex-start", backgroundColor: v2Theme.colors.brandSofter },
  restaurantPhoto: { ...StyleSheet.absoluteFillObject },
  photoScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(7,20,12,0.12)" },
  acceptingBadge: { borderRadius: v2Theme.radius.pill, backgroundColor: "rgba(255,255,255,0.95)", paddingHorizontal: 10, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 6 },
  acceptingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: v2Theme.colors.success },
  acceptingText: { color: v2Theme.colors.brandStrong, fontSize: 9, fontWeight: "900" },
  orderableInfo: { paddingHorizontal: 15, paddingTop: 13, paddingBottom: 15, gap: 7 },
  restaurantNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  orderableName: { flex: 1, color: v2Theme.colors.ink, fontSize: 18, lineHeight: 22, fontWeight: "900", letterSpacing: -0.3 },
  orderableDescription: { color: v2Theme.colors.inkSecondary, fontSize: 11, lineHeight: 16 },
  browseCard: { height: 124, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surfaceElevated, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, padding: 12, flexDirection: "row", alignItems: "center", gap: 13 },
  logoFrame: { width: 70, height: 70, borderRadius: 18, overflow: "hidden", backgroundColor: v2Theme.colors.surfaceMuted, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line },
  logoImage: { width: "100%", height: "100%" },
  browseCopy: { flex: 1, minWidth: 0, gap: 4 },
  browseName: { color: v2Theme.colors.ink, fontSize: 15, lineHeight: 18, fontWeight: "900", letterSpacing: -0.15 },
  browseDescription: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 13 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  tag: { borderRadius: 9, backgroundColor: "#F0F1ED", paddingHorizontal: 6, paddingVertical: 3 },
  tagEmphasized: { backgroundColor: v2Theme.colors.brandSofter },
  tagText: { color: v2Theme.colors.inkSecondary, fontSize: 8, fontWeight: "800" },
  tagTextEmphasized: { color: v2Theme.colors.brandStrong },
  unavailableStatus: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 1 },
  unavailableText: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 13, fontWeight: "800" },
  emptyCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surfaceMuted, padding: 18, gap: 7, alignItems: "flex-start" },
  emptyTitle: { color: v2Theme.colors.ink, fontSize: 16, fontWeight: "900" },
  emptyBody: { color: v2Theme.colors.inkSecondary, fontSize: 11, lineHeight: 16 },
  availabilityNote: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surfaceMuted, padding: 14, flexDirection: "row", alignItems: "flex-start", gap: 10 },
  availabilityNoteText: { flex: 1, color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 16 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
});
