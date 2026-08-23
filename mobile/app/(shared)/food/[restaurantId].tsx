import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";

import { Screen } from "../../../components/ui/Screen";
import { v2Theme } from "../../../constants/v2Theme";
import { useFoodBasket } from "../../../contexts/FoodBasketContext";
import { getRestaurantMenu } from "../../../services/foodService";
import { MenuCategory, MenuItem, RestaurantMenu } from "../../../types/food.types";

export default function RestaurantScreen() {
  const { restaurantId } = useLocalSearchParams<{ restaurantId: string }>();
  const router = useRouter();
  const basket = useFoodBasket();
  const [menu, setMenu] = useState<RestaurantMenu | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadMenu() {
    if (!restaurantId) return;
    try {
      setError(null);
      const nextMenu = await getRestaurantMenu(restaurantId);
      setMenu(nextMenu);
      setActiveCategory((current) => current || nextMenu.categories[0]?.id || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load this restaurant.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMenu();
  }, [restaurantId]);

  const visibleItems = useMemo(() => {
    if (!menu) return [];
    if (!activeCategory) return menu.items;
    return menu.items.filter((item) => item.category_id === activeCategory);
  }, [menu, activeCategory]);

  const basketBelongsHere = basket.restaurant?.id === restaurantId;

  return (
    <Screen showBack fallbackRoute="/(customer)/food" title={menu?.restaurant.name || "Restaurant"} showNotifications={false}>
      {loading ? <MenuState icon="silverware-fork-knife" title="Loading menu" body="Fetching the latest published items and availability…" /> : null}
      {error ? (
        <Pressable accessibilityRole="button" onPress={loadMenu} style={styles.errorCard}>
          <MaterialCommunityIcons name="alert-circle-outline" size={22} color={v2Theme.colors.danger} />
          <View style={styles.stateCopy}>
            <Text style={styles.errorTitle}>Couldn’t load the menu</Text>
            <Text style={styles.stateBody}>{error}</Text>
          </View>
          <Text style={styles.retry}>Retry</Text>
        </Pressable>
      ) : null}

      {menu ? (
        <>
          <RestaurantHero menu={menu} />

          {basketBelongsHere && basket.itemCount > 0 ? (
            <BasketBar count={basket.itemCount} subtotal={basket.subtotalUsd} onPress={() => router.push("/(shared)/food/checkout" as never)} />
          ) : null}

          {menu.categories.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
              {menu.categories.map((category) => (
                <CategoryPill key={category.id} category={category} active={category.id === activeCategory} onPress={() => setActiveCategory(category.id)} />
              ))}
            </ScrollView>
          ) : null}

          <View style={styles.sectionHeader}>
            <View><Text style={styles.sectionTitle}>{categoryName(menu.categories, activeCategory) || "Menu"}</Text><Text style={styles.sectionSub}>{visibleItems.length} available items</Text></View>
            <Text style={styles.currency}>USD</Text>
          </View>

          {visibleItems.length === 0 ? <MenuState icon="food-off-outline" title="Nothing available here right now" body="This restaurant has not published available items in this category." /> : null}

          <View style={styles.menuList}>
            {visibleItems.map((item) => {
              const quantity = basketBelongsHere ? basket.lines.find((line) => line.item.id === item.id)?.quantity || 0 : 0;
              return <MenuItemCard key={item.id} item={item} quantity={quantity} onAdd={() => basket.addItem(menu.restaurant, item)} onRemove={() => basket.decrementItem(item.id)} />;
            })}
          </View>

          {basketBelongsHere && basket.itemCount > 0 ? <BasketBar count={basket.itemCount} subtotal={basket.subtotalUsd} onPress={() => router.push("/(shared)/food/checkout" as never)} large /> : null}
        </>
      ) : null}
    </Screen>
  );
}

function RestaurantHero({ menu }: { menu: RestaurantMenu }) {
  const restaurant = menu.restaurant;
  return (
    <View style={styles.heroCard}>
      <View style={styles.heroMedia}>
        {restaurant.hero_image_url ? <Image source={{ uri: restaurant.hero_image_url }} resizeMode="cover" style={styles.heroImage} /> : <View style={styles.heroFallback}><MaterialCommunityIcons name="storefront-outline" size={42} color={v2Theme.colors.brandStrong} /><Text style={styles.heroFallbackText}>LetsGoRide Food</Text></View>}
      </View>
      <View style={styles.heroInfo}>
        <View style={styles.heroTitleRow}><Text style={styles.heroTitle}>{restaurant.name}</Text>{restaurant.is_accepting_orders === false ? <Text style={styles.pausedBadge}>PAUSED</Text> : <Text style={styles.openBadge}>OPEN</Text>}</View>
        {restaurant.description ? <Text style={styles.heroDescription}>{restaurant.description}</Text> : null}
        <View style={styles.metaRow}>
          <RestaurantMeta icon="map-marker-outline" text={restaurant.address} />
          {typeof restaurant.rating === "number" ? <RestaurantMeta icon="star" text={restaurant.rating.toFixed(1)} /> : null}
          {restaurant.cuisine_tags?.slice(0, 3).map((tag) => <RestaurantMeta key={tag} icon="circle-small" text={tag} />)}
        </View>
      </View>
    </View>
  );
}

function RestaurantMeta({ icon, text }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; text: string }) {
  return <View style={styles.metaItem}><MaterialCommunityIcons name={icon} size={14} color={v2Theme.colors.inkSecondary} /><Text numberOfLines={1} style={styles.metaText}>{text}</Text></View>;
}

function CategoryPill({ category, active, onPress }: { category: MenuCategory; active: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={({ pressed }) => [styles.categoryPill, active && styles.categoryPillActive, pressed && styles.pressed]}><Text style={[styles.categoryPillText, active && styles.categoryPillTextActive]}>{category.name}</Text></Pressable>;
}

function MenuItemCard({ item, quantity, onAdd, onRemove }: { item: MenuItem; quantity: number; onAdd: () => void; onRemove: () => void }) {
  return (
    <View style={styles.itemCard}>
      <View style={styles.itemCopy}><Text style={styles.itemTitle}>{item.name}</Text>{item.description ? <Text numberOfLines={3} style={styles.itemDescription}>{item.description}</Text> : null}<View style={styles.itemFooter}><Text style={styles.itemPrice}>${item.price_usd.toFixed(2)}</Text>{item.preparation_minutes ? <Text style={styles.prepTime}>{item.preparation_minutes} min prep</Text> : null}</View></View>
      <View style={styles.itemRight}>
        {item.image_url ? <Image source={{ uri: item.image_url }} resizeMode="cover" style={styles.itemImage} /> : <View style={styles.itemImageFallback}><MaterialCommunityIcons name="food-outline" size={28} color={v2Theme.colors.inkTertiary} /></View>}
        {quantity > 0 ? <View style={styles.stepper}><Pressable accessibilityRole="button" accessibilityLabel={`Remove one ${item.name}`} onPress={onRemove} style={styles.stepButton}><MaterialCommunityIcons name="minus" size={17} color={v2Theme.colors.ink} /></Pressable><Text style={styles.quantity}>{quantity}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Add another ${item.name}`} onPress={onAdd} style={styles.stepButton}><MaterialCommunityIcons name="plus" size={17} color={v2Theme.colors.ink} /></Pressable></View> : <Pressable accessibilityRole="button" accessibilityLabel={`Add ${item.name}`} onPress={onAdd} style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}><MaterialCommunityIcons name="plus" size={19} color="#FFFFFF" /></Pressable>}
      </View>
    </View>
  );
}

function BasketBar({ count, subtotal, onPress, large = false }: { count: number; subtotal: number; onPress: () => void; large?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel="Review basket" onPress={onPress} style={({ pressed }) => [styles.basketBar, large && styles.basketBarLarge, pressed && styles.pressed]}><View style={styles.basketCount}><Text style={styles.basketCountText}>{count}</Text></View><View style={styles.basketCopy}><Text style={styles.basketTitle}>Review order</Text><Text style={styles.basketSub}>Items subtotal</Text></View><Text style={styles.basketPrice}>${subtotal.toFixed(2)}</Text><MaterialCommunityIcons name="arrow-right" size={20} color="#FFFFFF" /></Pressable>;
}

function MenuState({ icon, title, body }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; body: string }) {
  return <View style={styles.stateCard}><View style={styles.stateIcon}><MaterialCommunityIcons name={icon} size={25} color={v2Theme.colors.brandStrong} /></View><View style={styles.stateCopy}><Text style={styles.stateTitle}>{title}</Text><Text style={styles.stateBody}>{body}</Text></View></View>;
}

function categoryName(categories: MenuCategory[], id: string | null) { return categories.find((category) => category.id === id)?.name; }

const styles = StyleSheet.create({
  heroCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, overflow: "hidden" },
  heroMedia: { height: 178, backgroundColor: v2Theme.colors.surfaceMuted }, heroImage: { width: "100%", height: "100%" },
  heroFallback: { flex: 1, backgroundColor: v2Theme.colors.brandSofter, alignItems: "center", justifyContent: "center", gap: 8 }, heroFallbackText: { color: v2Theme.colors.brandStrong, fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  heroInfo: { padding: 16, gap: 8 }, heroTitleRow: { flexDirection: "row", alignItems: "center", gap: 10 }, heroTitle: { flex: 1, color: v2Theme.colors.ink, fontSize: 23, fontWeight: "900", letterSpacing: -0.55 },
  openBadge: { color: v2Theme.colors.brandStrong, backgroundColor: v2Theme.colors.brandSoft, borderRadius: v2Theme.radius.pill, overflow: "hidden", paddingHorizontal: 8, paddingVertical: 5, fontSize: 9, fontWeight: "900" }, pausedBadge: { color: v2Theme.colors.warning, backgroundColor: v2Theme.colors.warningSoft, borderRadius: v2Theme.radius.pill, overflow: "hidden", paddingHorizontal: 8, paddingVertical: 5, fontSize: 9, fontWeight: "900" },
  heroDescription: { color: v2Theme.colors.inkSecondary, fontSize: 13, lineHeight: 20 }, metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, metaItem: { maxWidth: "100%", flexDirection: "row", alignItems: "center", gap: 4 }, metaText: { flexShrink: 1, color: v2Theme.colors.inkSecondary, fontSize: 10, fontWeight: "700" },
  categoryRow: { gap: 8, paddingRight: 20 }, categoryPill: { minHeight: 42, borderRadius: v2Theme.radius.pill, backgroundColor: v2Theme.colors.surfaceMuted, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" }, categoryPillActive: { backgroundColor: v2Theme.colors.ink }, categoryPillText: { color: v2Theme.colors.inkSecondary, fontSize: 12, fontWeight: "900" }, categoryPillTextActive: { color: "#FFFFFF" },
  sectionHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }, sectionTitle: { color: v2Theme.colors.ink, fontSize: 21, fontWeight: "900", letterSpacing: -0.4 }, sectionSub: { color: v2Theme.colors.inkSecondary, fontSize: 10, marginTop: 2 }, currency: { color: v2Theme.colors.inkSecondary, fontSize: 10, fontWeight: "900", letterSpacing: 0.6 },
  menuList: { gap: 10 }, itemCard: { minHeight: 136, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 14, flexDirection: "row", gap: 12 }, itemCopy: { flex: 1, gap: 6 }, itemTitle: { color: v2Theme.colors.ink, fontSize: 16, fontWeight: "900", letterSpacing: -0.2 }, itemDescription: { color: v2Theme.colors.inkSecondary, fontSize: 11, lineHeight: 17 }, itemFooter: { marginTop: "auto", flexDirection: "row", alignItems: "center", gap: 10 }, itemPrice: { color: v2Theme.colors.ink, fontSize: 14, fontWeight: "900" }, prepTime: { color: v2Theme.colors.inkTertiary, fontSize: 9, fontWeight: "800" },
  itemRight: { width: 96, alignItems: "flex-end", justifyContent: "space-between" }, itemImage: { width: 96, height: 82, borderRadius: 17 }, itemImageFallback: { width: 96, height: 82, borderRadius: 17, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" }, addButton: { width: 38, height: 38, borderRadius: 14, backgroundColor: v2Theme.colors.brand, alignItems: "center", justifyContent: "center", marginTop: -13 }, stepper: { minHeight: 38, borderRadius: 14, backgroundColor: v2Theme.colors.surfaceMuted, flexDirection: "row", alignItems: "center", paddingHorizontal: 3, marginTop: -13 }, stepButton: { width: 31, height: 31, borderRadius: 11, backgroundColor: v2Theme.colors.surface, alignItems: "center", justifyContent: "center" }, quantity: { minWidth: 25, textAlign: "center", color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900" },
  basketBar: { minHeight: 62, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.brand, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10 }, basketBarLarge: { minHeight: 70, marginTop: 2 }, basketCount: { width: 34, height: 34, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" }, basketCountText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" }, basketCopy: { flex: 1, gap: 2 }, basketTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" }, basketSub: { color: "rgba(255,255,255,0.72)", fontSize: 9, fontWeight: "700" }, basketPrice: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  stateCard: { minHeight: 78, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surfaceMuted, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 }, stateIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" }, stateCopy: { flex: 1, gap: 3 }, stateTitle: { color: v2Theme.colors.ink, fontSize: 13, fontWeight: "900" }, stateBody: { color: v2Theme.colors.inkSecondary, fontSize: 11, lineHeight: 16 },
  errorCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.dangerSoft, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 }, errorTitle: { color: v2Theme.colors.danger, fontSize: 13, fontWeight: "900" }, retry: { color: v2Theme.colors.danger, fontSize: 11, fontWeight: "900" }, pressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
});
