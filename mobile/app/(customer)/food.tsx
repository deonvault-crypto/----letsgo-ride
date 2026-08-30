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

const categories = [["silverware-fork-knife", "All"], ["food-drumstick", "Chicken"], ["pizza", "Pizza"], ["bread-slice-outline", "Bakery"], ["coffee-outline", "Café"]] as const;

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
    if (hasData) { setRefreshing(true); setRefreshError(null); } else { setInitialLoading(true); setInitialError(null); }
    try {
      const next = await listRestaurants();
      if (generation !== requestGeneration.current) return;
      restaurantsRef.current = next; setRestaurants(next); setInitialError(null); setRefreshError(null);
    } catch (err) {
      if (generation !== requestGeneration.current) return;
      const message = err instanceof Error ? err.message : "Unable to load restaurants.";
      if (restaurantsRef.current !== null) setRefreshError("Couldn’t refresh restaurants."); else setInitialError(message);
    } finally { if (generation === requestGeneration.current) { setInitialLoading(false); setRefreshing(false); } }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (restaurants || []).filter((restaurant) => {
      const searchable = [restaurant.name, restaurant.description || "", ...(restaurant.cuisine_tags || [])].join(" ").toLowerCase();
      return (category === "All" || searchable.includes(category.toLowerCase())) && (!needle || searchable.includes(needle));
    });
  }, [category, query, restaurants]);
  const openNow = visible.filter((restaurant) => restaurant.is_orderable);
  const unavailable = visible.filter((restaurant) => !restaurant.is_orderable);
  function openRestaurant(restaurant: Restaurant) { if (restaurant.is_orderable) router.push(`/(shared)/food/${restaurant.id}` as never); }
  return (
    <Screen title="Food" showBack fallbackRoute="/(customer)/home" navRole="customer" refreshing={refreshing} onRefresh={load}>
      <View style={styles.hero}><FoodImage role="landing" label="Freshly prepared food" style={styles.heroPhoto} /><View style={styles.heroScrim} /><View style={styles.heroCopy}><Text style={styles.heroEyebrow}>LETSGORIDE FOOD</Text><Text style={styles.heroTitle}>What are you craving?</Text><Text style={styles.heroBody}>Explore nearby restaurants and order from places that are open right now.</Text></View></View>
      <View style={styles.searchCard}><MaterialCommunityIcons name="magnify" size={21} color={v2Theme.colors.inkSecondary} /><TextInput accessibilityLabel="Search restaurants or food" value={query} onChangeText={setQuery} placeholder="Search restaurants or food" placeholderTextColor={v2Theme.colors.inkTertiary} style={styles.searchInput} returnKeyType="search" />{query ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery("")} hitSlop={8}><MaterialCommunityIcons name="close" size={19} color={v2Theme.colors.inkSecondary} /></Pressable> : null}</View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>{categories.map(([icon, label]) => { const active = category === label; return <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => setCategory(label)} style={[styles.category, active && styles.categoryActive]}><MaterialCommunityIcons name={icon} size={18} color={active ? "#FFFFFF" : v2Theme.colors.ink} /><Text style={[styles.categoryText, active && styles.categoryTextActive]}>{label}</Text></Pressable>; })}</ScrollView>
      {restaurants === null && initialLoading ? <RestaurantSkeleton /> : null}
      {restaurants === null && initialError ? <AppNotice title="Restaurants aren’t loading" message={initialError} actionLabel="Retry" onAction={load} /> : null}
      {restaurants !== null ? <AppNotice message={refreshError} actionLabel="Retry" onAction={load} onDismiss={() => setRefreshError(null)} autoDismissMs={4500} /> : null}
      {restaurants !== null ? <View style={styles.section}>
        <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Restaurants</Text><Text style={styles.sectionSub}>{visible.length} {visible.length === 1 ? "place" : "places"} to explore</Text></View>
        {openNow.length ? <View style={styles.tier}><Text style={styles.tierTitle}>Open now</Text>{openNow.map((restaurant) => <OpenRestaurantCard key={restaurant.id} restaurant={restaurant} onPress={() => openRestaurant(restaurant)} />)}</View> : null}
        {unavailable.length ? <View style={styles.tier}><Text style={styles.tierTitle}>{openNow.length ? "More restaurants" : "Restaurants"}</Text>{unavailable.map((restaurant) => <UnavailableRestaurantCard key={restaurant.id} restaurant={restaurant} />)}</View> : null}
        {!visible.length ? <View style={styles.emptyCard}><MaterialCommunityIcons name="store-search-outline" size={28} color={v2Theme.colors.ink} /><Text style={styles.emptyTitle}>{restaurants.length ? "No match" : "No restaurants available"}</Text><Text style={styles.emptyBody}>{restaurants.length ? "Try another restaurant, food or category." : "Please check again shortly."}</Text></View> : null}
      </View> : null}
    </Screen>
  );
}
function RestaurantSkeleton() { return <View accessibilityLabel="Loading restaurants" style={styles.skeleton}><View style={styles.skeletonHeading} /><View style={styles.skeletonMedia} /><View style={styles.skeletonLineWide} /><View style={styles.skeletonLine} /></View>; }
function OpenRestaurantCard({ restaurant, onPress }: { restaurant: Restaurant; onPress: () => void }) {
  const rating = restaurant.rating && restaurant.review_count ? `${Number(restaurant.rating).toFixed(1)} · ${restaurant.review_count} ratings` : "New on LetsGoRide";
  return <Pressable accessibilityRole="button" accessibilityLabel={`${restaurant.name}, open now`} onPress={onPress} style={({ pressed }) => [styles.openCard, pressed && styles.pressed]}><FoodImage uri={restaurant.hero_image_url} role="restaurant" label={restaurant.name} style={styles.restaurantPhoto} /><View style={styles.openInfo}><View style={styles.nameRow}><Text numberOfLines={1} style={styles.openName}>{restaurant.name}</Text><MaterialCommunityIcons name="chevron-right" size={21} color={v2Theme.colors.ink} /></View><Text style={styles.openMeta}>Open now · {rating}</Text>{restaurant.description ? <Text numberOfLines={2} style={styles.description}>{restaurant.description}</Text> : null}<CuisineLine tags={restaurant.cuisine_tags} /></View></Pressable>;
}
function UnavailableRestaurantCard({ restaurant }: { restaurant: Restaurant }) {
  const officialLogo = officialDirectoryLogos[restaurant.id];
  return <View accessibilityLabel={`${restaurant.name}, currently unavailable`} style={styles.unavailableCard}><View style={styles.logoFrame}><FoodImage source={officialLogo?.image} uri={officialLogo ? null : restaurant.logo_url} role="logo" label={`${restaurant.name} logo`} style={styles.logoImage} /></View><View style={styles.unavailableCopy}><Text numberOfLines={1} style={styles.unavailableName}>{restaurant.name}</Text><Text style={styles.unavailableStatus}>Currently unavailable</Text><CuisineLine tags={restaurant.cuisine_tags} /></View></View>;
}
function CuisineLine({ tags }: { tags?: string[] }) { if (!tags?.length) return null; return <Text numberOfLines={1} style={styles.cuisine}>{tags.slice(0, 3).join(" · ")}</Text>; }
const styles = StyleSheet.create({
  hero: { minHeight: 205, borderRadius: v2Theme.radius.xxl, overflow: "hidden", position: "relative", justifyContent: "flex-end", padding: 18, backgroundColor: "#111111" }, heroPhoto: { ...StyleSheet.absoluteFillObject }, heroScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.48)" }, heroCopy: { gap: 6 }, heroEyebrow: { color: "rgba(255,255,255,0.70)", fontSize: 9, fontWeight: "900", letterSpacing: 1.3 }, heroTitle: { color: "#FFFFFF", fontSize: 29, lineHeight: 33, fontWeight: "900", letterSpacing: -0.8 }, heroBody: { color: "rgba(255,255,255,0.80)", fontSize: 12, lineHeight: 17, maxWidth: 310 },
  searchCard: { minHeight: 54, borderRadius: 18, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 9 }, searchInput: { flex: 1, color: v2Theme.colors.ink, fontSize: 14, fontWeight: "700" }, categoryRow: { gap: 7, paddingRight: 20 }, category: { minHeight: 42, borderRadius: 14, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: v2Theme.colors.surfaceMuted }, categoryActive: { backgroundColor: "#111111" }, categoryText: { color: v2Theme.colors.ink, fontSize: 10, fontWeight: "900" }, categoryTextActive: { color: "#FFFFFF" },
  section: { gap: 18 }, sectionHeader: { gap: 2 }, sectionTitle: { color: v2Theme.colors.ink, fontSize: 21, fontWeight: "900", letterSpacing: -0.4 }, sectionSub: { color: v2Theme.colors.inkSecondary, fontSize: 10 }, tier: { gap: 10 }, tierTitle: { color: v2Theme.colors.ink, fontSize: 14, fontWeight: "900" }, openCard: { borderRadius: 24, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, overflow: "hidden" }, restaurantPhoto: { width: "100%", height: 150 }, openInfo: { padding: 14, gap: 5 }, nameRow: { flexDirection: "row", alignItems: "center", gap: 7 }, openName: { flex: 1, color: v2Theme.colors.ink, fontSize: 18, fontWeight: "900" }, openMeta: { color: v2Theme.colors.ink, fontSize: 10, fontWeight: "800" }, description: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15 }, cuisine: { color: v2Theme.colors.inkTertiary, fontSize: 9, fontWeight: "700", marginTop: 2 },
  unavailableCard: { minHeight: 86, borderRadius: 20, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 11, flexDirection: "row", alignItems: "center", gap: 11 }, logoFrame: { width: 64, height: 64, borderRadius: 17, overflow: "hidden", backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" }, logoImage: { width: "100%", height: "100%" }, unavailableCopy: { flex: 1, gap: 3 }, unavailableName: { color: v2Theme.colors.ink, fontSize: 14, fontWeight: "900" }, unavailableStatus: { color: v2Theme.colors.inkSecondary, fontSize: 9, fontWeight: "800" }, emptyCard: { borderRadius: 22, backgroundColor: v2Theme.colors.surfaceMuted, padding: 17, gap: 6 }, emptyTitle: { color: v2Theme.colors.ink, fontSize: 15, fontWeight: "900" }, emptyBody: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15 },
  skeleton: { borderRadius: 22, backgroundColor: v2Theme.colors.surface, padding: 14, gap: 10 }, skeletonHeading: { width: "35%", height: 14, borderRadius: 7, backgroundColor: v2Theme.colors.surfaceMuted }, skeletonMedia: { height: 150, borderRadius: 18, backgroundColor: v2Theme.colors.surfaceMuted }, skeletonLineWide: { width: "70%", height: 11, borderRadius: 6, backgroundColor: v2Theme.colors.surfaceMuted }, skeletonLine: { width: "45%", height: 10, borderRadius: 5, backgroundColor: v2Theme.colors.surfaceMuted }, pressed: { opacity: 0.76 },
});
