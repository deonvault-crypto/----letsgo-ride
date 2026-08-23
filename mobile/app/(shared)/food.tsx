import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";

import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";
import { useLocationDraft } from "../../contexts/LocationDraftContext";
import { listRestaurants } from "../../services/foodService";
import { Restaurant } from "../../types/food.types";

const categories = [
  ["silverware-fork-knife", "All"],
  ["hamburger", "Burgers"],
  ["food-drumstick", "Chicken"],
  ["pizza", "Pizza"],
  ["coffee-outline", "Café"],
] as const;

export default function FoodScreen() {
  const router = useRouter();
  const { foodDropoff } = useLocationDraft();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadRestaurants() {
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
    loadRestaurants();
  }, []);

  const visibleRestaurants = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return restaurants.filter((restaurant) => {
      const searchable = [restaurant.name, restaurant.description || "", ...(restaurant.cuisine_tags || [])].join(" ").toLowerCase();
      const categoryMatches = category === "All" || searchable.includes(category.toLowerCase());
      return categoryMatches && (!needle || searchable.includes(needle));
    });
  }, [restaurants, query, category]);

  const orderableCount = restaurants.filter((restaurant) => restaurant.is_orderable !== false && restaurant.status === "ACTIVE").length;

  return (
    <Screen showBack fallbackRoute="/(customer)/home" title="Food" showNotifications={false}>
      <View style={styles.hero}>
        <View style={styles.heroBubble}><MaterialCommunityIcons name="food-takeout-box-outline" size={28} color="#FFFFFF" /></View>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>LETSGORIDE FOOD</Text>
          <Text style={styles.title}>Good food, delivered.</Text>
          <Text style={styles.body}>Choose a restaurant, build your basket and follow the order all the way to your door.</Text>
        </View>
      </View>

      <Pressable accessibilityRole="button" onPress={() => router.push("/(shared)/location-picker?kind=food" as never)} style={({ pressed }) => [styles.locationCard, pressed && styles.pressed]}>
        <View style={styles.locationIcon}><MaterialCommunityIcons name={foodDropoff ? "map-marker" : "map-marker-outline"} size={22} color={v2Theme.colors.brandStrong} /></View>
        <View style={styles.locationCopy}>
          <Text style={styles.locationLabel}>DELIVER TO</Text>
          <Text numberOfLines={1} style={styles.locationValue}>{foodDropoff?.label || "Choose your delivery location"}</Text>
          <Text numberOfLines={1} style={styles.locationAddress}>{foodDropoff?.address || "Search, use GPS or place the pin exactly"}</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={v2Theme.colors.inkTertiary} />
      </Pressable>

      <View style={styles.search}>
        <MaterialCommunityIcons name="magnify" size={22} color={v2Theme.colors.inkSecondary} />
        <TextInput accessibilityLabel="Search restaurants or dishes" value={query} onChangeText={setQuery} placeholder="Search restaurants or dishes" placeholderTextColor={v2Theme.colors.inkTertiary} style={styles.searchInput} returnKeyType="search" />
        {query ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery("")} hitSlop={8}><MaterialCommunityIcons name="close-circle" size={19} color={v2Theme.colors.inkTertiary} /></Pressable> : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
        {categories.map(([icon, label]) => {
          const active = category === label;
          return <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => setCategory(label)} style={({ pressed }) => [styles.categoryCard, active && styles.categoryCardActive, pressed && styles.pressed]}>
            <View style={[styles.categoryIcon, active && styles.categoryIconActive]}><MaterialCommunityIcons name={icon} size={22} color={active ? v2Theme.colors.brandStrong : v2Theme.colors.ink} /></View>
            <Text style={[styles.categoryLabel, active && styles.categoryLabelActive]}>{label}</Text>
          </Pressable>;
        })}
      </ScrollView>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View><Text style={styles.sectionTitle}>Restaurants</Text><Text style={styles.sectionSub}>{orderableCount ? `${orderableCount} open for orders` : "Explore the marketplace"}</Text></View>
          {orderableCount ? <View style={styles.liveLabel}><View style={styles.liveDot} /><Text style={styles.liveLabelText}>LIVE</Text></View> : null}
        </View>

        {loading ? <View style={styles.stateCard}><View style={styles.stateIcon}><MaterialCommunityIcons name="storefront-outline" size={25} color={v2Theme.colors.brandStrong} /></View><View style={styles.stateCopy}><Text style={styles.stateTitle}>Finding restaurants near you</Text><Text style={styles.stateBody}>Loading menus and availability…</Text></View></View> : null}
        {error ? <Pressable accessibilityRole="button" onPress={loadRestaurants} style={styles.errorCard}><MaterialCommunityIcons name="alert-circle-outline" size={22} color={v2Theme.colors.danger} /><View style={styles.stateCopy}><Text style={styles.errorTitle}>Couldn’t load restaurants</Text><Text style={styles.stateBody}>{error}</Text></View><Text style={styles.retry}>Retry</Text></Pressable> : null}
        {!loading && !error && restaurants.length === 0 ? <View style={styles.marketState}><View style={styles.marketIcon}><MaterialCommunityIcons name="storefront-plus-outline" size={30} color={v2Theme.colors.brandStrong} /></View><Text style={styles.marketTitle}>More kitchens are joining</Text><Text style={styles.marketBody}>New restaurants will appear here as they become available in your area.</Text></View> : null}
        {!loading && !error && restaurants.length > 0 && visibleRestaurants.length === 0 ? <View style={styles.stateCard}><MaterialCommunityIcons name="magnify-close" size={25} color={v2Theme.colors.inkSecondary} /><View style={styles.stateCopy}><Text style={styles.stateTitle}>No matches</Text><Text style={styles.stateBody}>Try another restaurant, dish or category.</Text></View></View> : null}

        {visibleRestaurants.map((restaurant) => <RestaurantCard key={restaurant.id} restaurant={restaurant} onPress={() => restaurant.is_orderable === false || restaurant.status !== "ACTIVE" ? undefined : router.push(`/(shared)/food/${restaurant.id}` as never)} />)}
      </View>
    </Screen>
  );
}

function RestaurantCard({ restaurant, onPress }: { restaurant: Restaurant; onPress?: () => void }) {
  const available = Boolean(onPress) && restaurant.is_accepting_orders !== false;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !available }} disabled={!available} onPress={onPress} style={({ pressed }) => [styles.restaurantCard, !available && styles.restaurantCardMuted, pressed && styles.pressed]}>
      <View style={styles.restaurantMedia}>
        {restaurant.hero_image_url ? <Image source={{ uri: restaurant.hero_image_url }} resizeMode="cover" style={styles.restaurantImage} /> : <View style={styles.restaurantFallback}><View style={styles.fallbackPlate}><MaterialCommunityIcons name="silverware-fork-knife" size={34} color={v2Theme.colors.brandStrong} /></View><View style={styles.fallbackDots}><View style={styles.foodDotLarge} /><View style={styles.foodDot} /><View style={styles.foodDotSmall} /></View></View>}
        <View style={[styles.statusBadge, !available && styles.statusBadgeMuted]}><View style={[styles.statusDot, !available && styles.statusDotMuted]} /><Text style={styles.statusBadgeText}>{restaurant.status === "COMING_SOON" ? "Coming soon" : restaurant.is_accepting_orders === false ? "Closed" : "Open"}</Text></View>
      </View>
      <View style={styles.restaurantInfo}>
        <View style={styles.restaurantTitleRow}><Text numberOfLines={1} style={styles.restaurantName}>{restaurant.name}</Text>{available ? <MaterialCommunityIcons name="chevron-right" size={22} color={v2Theme.colors.inkTertiary} /> : null}</View>
        {restaurant.description ? <Text numberOfLines={2} style={styles.restaurantDescription}>{restaurant.description}</Text> : null}
        <View style={styles.restaurantMeta}>{typeof restaurant.rating === "number" ? <Meta icon="star" text={`${restaurant.rating.toFixed(1)}${restaurant.review_count ? ` (${restaurant.review_count})` : ""}`} /> : null}{restaurant.cuisine_tags?.slice(0, 3).map((tag) => <Meta key={tag} icon="circle-small" text={tag} />)}</View>
      </View>
    </Pressable>
  );
}

function Meta({ icon, text }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; text: string }) { return <View style={styles.metaItem}><MaterialCommunityIcons name={icon} size={14} color={v2Theme.colors.inkSecondary} /><Text style={styles.metaText}>{text}</Text></View>; }

const styles = StyleSheet.create({
  hero: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.ink, minHeight: 150, padding: 18, flexDirection: "row", gap: 14, alignItems: "center" }, heroBubble: { width: 58, height: 58, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" }, heroCopy: { flex: 1, gap: 6 }, eyebrow: { color: "#8FE6AE", fontSize: 9, fontWeight: "900", letterSpacing: 1.2 }, title: { color: "#FFFFFF", fontSize: 27, lineHeight: 31, fontWeight: "900", letterSpacing: -0.8 }, body: { color: "rgba(255,255,255,0.68)", fontSize: 11, lineHeight: 17 },
  locationCard: { minHeight: 82, borderRadius: v2Theme.radius.xl, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, backgroundColor: v2Theme.colors.surface, padding: 13, flexDirection: "row", alignItems: "center", gap: 11 }, locationIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" }, locationCopy: { flex: 1, gap: 2 }, locationLabel: { color: v2Theme.colors.brandStrong, fontSize: 8, fontWeight: "900", letterSpacing: 0.8 }, locationValue: { color: v2Theme.colors.ink, fontSize: 13, fontWeight: "900" }, locationAddress: { color: v2Theme.colors.inkSecondary, fontSize: 9 },
  search: { minHeight: 58, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surfaceMuted, paddingHorizontal: 17, flexDirection: "row", alignItems: "center", gap: 10 }, searchInput: { flex: 1, color: v2Theme.colors.ink, fontSize: 15, fontWeight: "700", paddingVertical: 0 },
  categoryRow: { gap: 9, paddingRight: 20 }, categoryCard: { minWidth: 86, height: 92, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surfaceMuted, padding: 10, justifyContent: "space-between", borderWidth: 1, borderColor: "transparent" }, categoryCardActive: { backgroundColor: v2Theme.colors.brandSofter, borderColor: "#D5EBDD" }, categoryIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: v2Theme.colors.surface, alignItems: "center", justifyContent: "center" }, categoryIconActive: { backgroundColor: v2Theme.colors.brandSoft }, categoryLabel: { color: v2Theme.colors.ink, fontSize: 11, fontWeight: "900" }, categoryLabelActive: { color: v2Theme.colors.brandStrong },
  section: { gap: 12 }, sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }, sectionTitle: { color: v2Theme.colors.ink, fontSize: 21, fontWeight: "900", letterSpacing: -0.4 }, sectionSub: { color: v2Theme.colors.inkSecondary, fontSize: 10, marginTop: 2 }, liveLabel: { borderRadius: 999, backgroundColor: v2Theme.colors.brandSofter, paddingHorizontal: 8, paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 5 }, liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: v2Theme.colors.success }, liveLabelText: { color: v2Theme.colors.brandStrong, fontSize: 8, fontWeight: "900" },
  marketState: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.brandSofter, padding: 20, gap: 10 }, marketIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" }, marketTitle: { color: v2Theme.colors.ink, fontSize: 19, fontWeight: "900" }, marketBody: { color: v2Theme.colors.inkSecondary, fontSize: 13, lineHeight: 20 }, stateCard: { minHeight: 76, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surfaceMuted, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 }, stateIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" }, stateCopy: { flex: 1, gap: 3 }, stateTitle: { color: v2Theme.colors.ink, fontSize: 13, fontWeight: "900" }, stateBody: { color: v2Theme.colors.inkSecondary, fontSize: 11, lineHeight: 16 }, errorCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.dangerSoft, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 }, errorTitle: { color: v2Theme.colors.danger, fontSize: 13, fontWeight: "900" }, retry: { color: v2Theme.colors.danger, fontSize: 11, fontWeight: "900" },
  restaurantCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, overflow: "hidden" }, restaurantCardMuted: { opacity: 0.74 }, restaurantMedia: { height: 162, backgroundColor: v2Theme.colors.surfaceMuted, position: "relative" }, restaurantImage: { width: "100%", height: "100%" }, restaurantFallback: { flex: 1, backgroundColor: v2Theme.colors.brandSofter, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16 }, fallbackPlate: { width: 76, height: 76, borderRadius: 38, backgroundColor: v2Theme.colors.surface, alignItems: "center", justifyContent: "center", shadowColor: v2Theme.colors.shadow, shadowOpacity: 0.08, shadowRadius: 14 }, fallbackDots: { gap: 7 }, foodDotLarge: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#F6C777" }, foodDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#9BD7AE" }, foodDotSmall: { width: 14, height: 14, borderRadius: 7, backgroundColor: "#F0A98C" }, statusBadge: { position: "absolute", left: 12, bottom: 12, borderRadius: v2Theme.radius.pill, backgroundColor: "rgba(255,255,255,0.95)", paddingHorizontal: 9, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 5 }, statusBadgeMuted: { backgroundColor: "rgba(255,255,255,0.88)" }, statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: v2Theme.colors.success }, statusDotMuted: { backgroundColor: v2Theme.colors.inkTertiary }, statusBadgeText: { color: v2Theme.colors.ink, fontSize: 9, fontWeight: "900" }, restaurantInfo: { padding: 15, gap: 7 }, restaurantTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 }, restaurantName: { flex: 1, color: v2Theme.colors.ink, fontSize: 18, fontWeight: "900", letterSpacing: -0.35 }, restaurantDescription: { color: v2Theme.colors.inkSecondary, fontSize: 11, lineHeight: 17 }, restaurantMeta: { flexDirection: "row", flexWrap: "wrap", gap: 9 }, metaItem: { flexDirection: "row", alignItems: "center", gap: 3 }, metaText: { color: v2Theme.colors.inkSecondary, fontSize: 9, fontWeight: "700" }, pressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
});
