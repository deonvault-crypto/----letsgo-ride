import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Screen } from "../../../components/ui/Screen";
import { v2Theme } from "../../../constants/v2Theme";
import {
  createMenuCategory,
  createMenuItem,
  getRestaurantWorkspace,
  submitRestaurantForReview,
  updateMerchantOrderStatus,
  updateRestaurant,
} from "../../../services/merchantService";
import { FoodOrder, FoodOrderStatus } from "../../../types/food.types";
import { MerchantDashboardData } from "../../../types/merchant.types";

export default function MerchantRestaurantScreen() {
  const { restaurantId } = useLocalSearchParams<{ restaurantId: string }>();
  const [workspace, setWorkspace] = useState<MerchantDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [itemPrep, setItemPrep] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!restaurantId) return;
    try {
      setError(null);
      const data = await getRestaurantWorkspace(restaurantId);
      setWorkspace(data);
      setSelectedCategory((current) => current || data.categories[0]?.id || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load restaurant workspace.");
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    load();
  }, [load]);

  const activeOrders = useMemo(
    () => workspace?.orders.filter((order) => !["DELIVERED", "CANCELLED", "REJECTED"].includes(order.status)) || [],
    [workspace?.orders],
  );

  async function toggleAccepting() {
    if (!workspace || busy) return;
    try {
      setBusy(true);
      setError(null);
      const restaurant = await updateRestaurant(workspace.restaurant.id, { is_accepting_orders: !workspace.restaurant.is_accepting_orders });
      setWorkspace({ ...workspace, restaurant });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to change order availability.");
    } finally {
      setBusy(false);
    }
  }

  async function submitReview() {
    if (!workspace || busy) return;
    try {
      setBusy(true);
      setError(null);
      const restaurant = await submitRestaurantForReview(workspace.restaurant.id);
      setWorkspace({ ...workspace, restaurant });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit restaurant for review.");
    } finally {
      setBusy(false);
    }
  }

  async function addCategory() {
    if (!workspace || categoryName.trim().length < 1 || busy) return;
    try {
      setBusy(true);
      setError(null);
      const category = await createMenuCategory(workspace.restaurant.id, { name: categoryName.trim(), sort_order: workspace.categories.length });
      const categories = [...workspace.categories, category];
      setWorkspace({ ...workspace, categories });
      setSelectedCategory(category.id);
      setCategoryName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add category.");
    } finally {
      setBusy(false);
    }
  }

  async function addItem() {
    if (!workspace || !selectedCategory || itemName.trim().length < 1 || busy) return;
    const price = Number(itemPrice);
    const prep = itemPrep.trim() ? Number(itemPrep) : null;
    if (!Number.isFinite(price) || price < 0 || (prep != null && (!Number.isFinite(prep) || prep < 0))) {
      setError("Enter a valid USD price and preparation time.");
      return;
    }
    try {
      setBusy(true);
      setError(null);
      const item = await createMenuItem(workspace.restaurant.id, {
        category_id: selectedCategory,
        name: itemName.trim(),
        description: itemDescription.trim() || null,
        price_usd: price,
        preparation_minutes: prep == null ? null : Math.floor(prep),
        is_available: true,
      });
      setWorkspace({ ...workspace, items: [...workspace.items, item] });
      setItemName("");
      setItemPrice("");
      setItemDescription("");
      setItemPrep("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add menu item.");
    } finally {
      setBusy(false);
    }
  }

  async function advanceOrder(order: FoodOrder, status: FoodOrderStatus) {
    if (!workspace || busy) return;
    try {
      setBusy(true);
      setError(null);
      const updated = await updateMerchantOrderStatus(order.id, { status });
      setWorkspace({ ...workspace, orders: workspace.orders.map((item) => item.id === updated.id ? updated : item) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update order.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen showBack fallbackRoute="/(merchant)/home" title={workspace?.restaurant.name || "Restaurant"} showNotifications={false}>
      {loading ? <Text style={styles.loading}>Loading restaurant workspace…</Text> : null}
      {error ? <Pressable accessibilityRole="button" onPress={load} style={styles.errorCard}><MaterialCommunityIcons name="alert-circle-outline" size={21} color={v2Theme.colors.danger} /><Text style={styles.errorText}>{error}</Text><Text style={styles.retry}>Retry</Text></Pressable> : null}

      {workspace ? (
        <>
          <View style={styles.heroCard}>
            <View style={styles.heroTop}>
              <View style={styles.heroIcon}><MaterialCommunityIcons name="storefront-outline" size={27} color={v2Theme.colors.brandStrong} /></View>
              <View style={styles.heroCopy}>
                <Text style={styles.heroEyebrow}>{workspace.restaurant.status.replaceAll("_", " ")}</Text>
                <Text style={styles.heroTitle}>{workspace.restaurant.name}</Text>
                <Text numberOfLines={1} style={styles.heroAddress}>{workspace.restaurant.address}</Text>
              </View>
            </View>
            <View style={styles.metricsRow}>
              <Metric label="Active orders" value={String(activeOrders.length)} />
              <Metric label="Menu items" value={String(workspace.items.length)} />
              <Metric label="Categories" value={String(workspace.categories.length)} />
            </View>
          </View>

          <View style={styles.controlCard}>
            <View style={styles.controlCopy}>
              <Text style={styles.controlTitle}>Accepting orders</Text>
              <Text style={styles.controlBody}>{workspace.restaurant.status === "ACTIVE" ? "Pause or resume customer ordering." : "This becomes available after activation."}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: workspace.restaurant.status !== "ACTIVE" || busy }}
              disabled={workspace.restaurant.status !== "ACTIVE" || busy}
              onPress={toggleAccepting}
              style={[styles.toggleButton, workspace.restaurant.is_accepting_orders && styles.toggleButtonOn, workspace.restaurant.status !== "ACTIVE" && styles.disabled]}
            >
              <View style={[styles.toggleDot, workspace.restaurant.is_accepting_orders && styles.toggleDotOn]} />
              <Text style={[styles.toggleText, workspace.restaurant.is_accepting_orders && styles.toggleTextOn]}>{workspace.restaurant.is_accepting_orders ? "Live" : "Paused"}</Text>
            </Pressable>
          </View>

          {workspace.restaurant.status === "DRAFT" ? (
            <Pressable accessibilityRole="button" onPress={submitReview} disabled={busy} style={({ pressed }) => [styles.reviewButton, pressed && styles.pressed]}>
              <View style={styles.reviewIcon}><MaterialCommunityIcons name="shield-check-outline" size={23} color={v2Theme.colors.brandStrong} /></View>
              <View style={styles.reviewCopy}>
                <Text style={styles.reviewTitle}>Submit for merchant review</Text>
                <Text style={styles.reviewBody}>Requires at least one category and one menu item.</Text>
              </View>
              <MaterialCommunityIcons name="arrow-right" size={21} color={v2Theme.colors.ink} />
            </Pressable>
          ) : null}

          <View style={styles.section}>
            <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Incoming orders</Text><Text style={styles.sectionSub}>Kitchen workflow</Text></View><Text style={styles.count}>{activeOrders.length}</Text></View>
            {activeOrders.length === 0 ? <EmptyRow icon="receipt-text-outline" title="No active orders" body="New customer orders will appear here as soon as they are placed." /> : null}
            <View style={styles.orderList}>
              {activeOrders.map((order) => <MerchantOrderCard key={order.id} order={order} busy={busy} onAdvance={advanceOrder} />)}
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Menu</Text><Text style={styles.sectionSub}>Build categories before dishes</Text></View><Text style={styles.count}>{workspace.items.length}</Text></View>

            <View style={styles.builderCard}>
              <Text style={styles.builderTitle}>Add category</Text>
              <View style={styles.inlineForm}>
                <TextInput accessibilityLabel="Category name" value={categoryName} onChangeText={setCategoryName} placeholder="e.g. Burgers" placeholderTextColor={v2Theme.colors.inkTertiary} style={styles.inlineInput} />
                <Pressable accessibilityRole="button" accessibilityLabel="Add menu category" onPress={addCategory} disabled={!categoryName.trim() || busy} style={[styles.squareButton, (!categoryName.trim() || busy) && styles.disabled]}><MaterialCommunityIcons name="plus" size={21} color="#FFFFFF" /></Pressable>
              </View>
              {workspace.categories.length ? (
                <View style={styles.categoryWrap}>
                  {workspace.categories.map((category) => (
                    <Pressable key={category.id} accessibilityRole="button" accessibilityState={{ selected: selectedCategory === category.id }} onPress={() => setSelectedCategory(category.id)} style={[styles.categoryPill, selectedCategory === category.id && styles.categoryPillActive]}>
                      <Text style={[styles.categoryText, selectedCategory === category.id && styles.categoryTextActive]}>{category.name}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>

            <View style={styles.builderCard}>
              <Text style={styles.builderTitle}>Add menu item</Text>
              <TextInput accessibilityLabel="Menu item name" value={itemName} onChangeText={setItemName} placeholder="Dish name" placeholderTextColor={v2Theme.colors.inkTertiary} style={styles.fullInput} />
              <View style={styles.twoColumn}>
                <TextInput accessibilityLabel="Menu item price" value={itemPrice} onChangeText={setItemPrice} keyboardType="decimal-pad" placeholder="USD price" placeholderTextColor={v2Theme.colors.inkTertiary} style={[styles.fullInput, styles.halfInput]} />
                <TextInput accessibilityLabel="Preparation minutes" value={itemPrep} onChangeText={setItemPrep} keyboardType="number-pad" placeholder="Prep min" placeholderTextColor={v2Theme.colors.inkTertiary} style={[styles.fullInput, styles.halfInput]} />
              </View>
              <TextInput accessibilityLabel="Menu item description" value={itemDescription} onChangeText={setItemDescription} multiline placeholder="Short description" placeholderTextColor={v2Theme.colors.inkTertiary} style={[styles.fullInput, styles.descriptionInput]} />
              <Pressable accessibilityRole="button" onPress={addItem} disabled={!selectedCategory || !itemName.trim() || !itemPrice.trim() || busy} style={[styles.addItemButton, (!selectedCategory || !itemName.trim() || !itemPrice.trim() || busy) && styles.disabled]}>
                <Text style={styles.addItemText}>Add to menu</Text><MaterialCommunityIcons name="plus" size={20} color="#FFFFFF" />
              </Pressable>
            </View>

            <View style={styles.menuList}>
              {workspace.items.map((item) => (
                <View key={item.id} style={styles.menuItemRow}>
                  <View style={styles.menuItemIcon}><MaterialCommunityIcons name="food-outline" size={22} color={v2Theme.colors.ink} /></View>
                  <View style={styles.menuItemCopy}><Text style={styles.menuItemName}>{item.name}</Text><Text style={styles.menuItemMeta}>${item.price_usd.toFixed(2)} · {item.is_available === false ? "Unavailable" : "Available"}</Text></View>
                  {item.preparation_minutes != null ? <Text style={styles.prep}>{item.preparation_minutes}m</Text> : null}
                </View>
              ))}
            </View>
          </View>
        </>
      ) : null}
    </Screen>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function MerchantOrderCard({ order, busy, onAdvance }: { order: FoodOrder; busy: boolean; onAdvance: (order: FoodOrder, status: FoodOrderStatus) => void }) {
  const next = nextMerchantStatus(order.status);
  const totalItems = order.items.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <View style={styles.orderCard}>
      <View style={styles.orderTop}>
        <View><Text style={styles.orderId}>ORDER {order.id.slice(0, 7).toUpperCase()}</Text><Text style={styles.orderName}>{order.recipient_name}</Text></View>
        <Text style={styles.orderStatus}>{order.status.replaceAll("_", " ")}</Text>
      </View>
      <Text style={styles.orderMeta}>{totalItems} items · ${order.subtotal_usd.toFixed(2)} · {order.delivery_address}</Text>
      <View style={styles.orderItems}>{order.items.slice(0, 4).map((item) => <Text key={item.menu_item_id} numberOfLines={1} style={styles.orderItem}>{item.quantity}× {item.name || "Menu item"}</Text>)}</View>
      <View style={styles.orderActions}>
        {order.status === "PLACED" ? <Pressable disabled={busy} onPress={() => onAdvance(order, "REJECTED")} style={styles.rejectButton}><Text style={styles.rejectText}>Reject</Text></Pressable> : null}
        {next ? <Pressable disabled={busy} onPress={() => onAdvance(order, next)} style={styles.advanceButton}><Text style={styles.advanceText}>{nextLabel(next)}</Text><MaterialCommunityIcons name="arrow-right" size={18} color="#FFFFFF" /></Pressable> : null}
      </View>
    </View>
  );
}

function EmptyRow({ icon, title, body }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; body: string }) {
  return <View style={styles.emptyRow}><View style={styles.emptyIcon}><MaterialCommunityIcons name={icon} size={23} color={v2Theme.colors.inkSecondary} /></View><View style={styles.emptyCopy}><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyBody}>{body}</Text></View></View>;
}

function nextMerchantStatus(status: FoodOrderStatus): FoodOrderStatus | null {
  if (status === "PLACED") return "ACCEPTED";
  if (status === "ACCEPTED") return "PREPARING";
  if (status === "PREPARING") return "READY_FOR_PICKUP";
  return null;
}

function nextLabel(status: FoodOrderStatus) {
  if (status === "ACCEPTED") return "Accept order";
  if (status === "PREPARING") return "Start preparing";
  if (status === "READY_FOR_PICKUP") return "Mark ready";
  return status.replaceAll("_", " ");
}

const styles = StyleSheet.create({
  loading: { color: v2Theme.colors.inkSecondary, fontSize: 12 },
  errorCard: { minHeight: 58, borderRadius: v2Theme.radius.lg, backgroundColor: v2Theme.colors.dangerSoft, padding: 12, flexDirection: "row", alignItems: "center", gap: 9 },
  errorText: { flex: 1, color: v2Theme.colors.danger, fontSize: 11, fontWeight: "700" },
  retry: { color: v2Theme.colors.danger, fontSize: 11, fontWeight: "900" },
  heroCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.ink, padding: 17, gap: 15 },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  heroIcon: { width: 52, height: 52, borderRadius: 18, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  heroCopy: { flex: 1, gap: 4 },
  heroEyebrow: { color: "rgba(255,255,255,0.6)", fontSize: 8, fontWeight: "900", letterSpacing: 0.9 },
  heroTitle: { color: "#FFFFFF", fontSize: 20, fontWeight: "900" },
  heroAddress: { color: "rgba(255,255,255,0.66)", fontSize: 10 },
  metricsRow: { flexDirection: "row", gap: 8 },
  metric: { flex: 1, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.08)", padding: 11, gap: 3 },
  metricValue: { color: "#FFFFFF", fontSize: 18, fontWeight: "900" },
  metricLabel: { color: "rgba(255,255,255,0.56)", fontSize: 8, fontWeight: "800" },
  controlCard: { minHeight: 78, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  controlCopy: { flex: 1, gap: 4 },
  controlTitle: { color: v2Theme.colors.ink, fontSize: 14, fontWeight: "900" },
  controlBody: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15 },
  toggleButton: { minHeight: 38, borderRadius: v2Theme.radius.pill, backgroundColor: v2Theme.colors.surfaceMuted, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 6 },
  toggleButtonOn: { backgroundColor: v2Theme.colors.brand },
  toggleDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: v2Theme.colors.inkTertiary },
  toggleDotOn: { backgroundColor: "#FFFFFF" },
  toggleText: { color: v2Theme.colors.ink, fontSize: 10, fontWeight: "900" },
  toggleTextOn: { color: "#FFFFFF" },
  reviewButton: { minHeight: 78, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.brandSofter, padding: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  reviewIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" },
  reviewCopy: { flex: 1, gap: 3 },
  reviewTitle: { color: v2Theme.colors.ink, fontSize: 13, fontWeight: "900" },
  reviewBody: { color: v2Theme.colors.inkSecondary, fontSize: 10 },
  section: { gap: 11 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: v2Theme.colors.ink, fontSize: 20, fontWeight: "900", letterSpacing: -0.4 },
  sectionSub: { color: v2Theme.colors.inkSecondary, fontSize: 10, marginTop: 2 },
  count: { minWidth: 32, textAlign: "center", color: v2Theme.colors.ink, backgroundColor: v2Theme.colors.surfaceMuted, borderRadius: v2Theme.radius.pill, overflow: "hidden", paddingVertical: 6, paddingHorizontal: 8, fontSize: 10, fontWeight: "900" },
  orderList: { gap: 9 },
  orderCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 14, gap: 10 },
  orderTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  orderId: { color: v2Theme.colors.brandStrong, fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
  orderName: { color: v2Theme.colors.ink, fontSize: 14, fontWeight: "900", marginTop: 3 },
  orderStatus: { color: v2Theme.colors.warning, backgroundColor: v2Theme.colors.warningSoft, borderRadius: v2Theme.radius.pill, overflow: "hidden", paddingHorizontal: 8, paddingVertical: 5, fontSize: 8, fontWeight: "900" },
  orderMeta: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15 },
  orderItems: { gap: 4 },
  orderItem: { color: v2Theme.colors.ink, fontSize: 10, fontWeight: "800" },
  orderActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  rejectButton: { minHeight: 40, borderRadius: 14, backgroundColor: v2Theme.colors.dangerSoft, paddingHorizontal: 13, alignItems: "center", justifyContent: "center" },
  rejectText: { color: v2Theme.colors.danger, fontSize: 10, fontWeight: "900" },
  advanceButton: { minHeight: 40, borderRadius: 14, backgroundColor: v2Theme.colors.ink, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 7 },
  advanceText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  emptyRow: { minHeight: 80, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  emptyIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  emptyCopy: { flex: 1, gap: 3 },
  emptyTitle: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900" },
  emptyBody: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15 },
  builderCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 14, gap: 10 },
  builderTitle: { color: v2Theme.colors.ink, fontSize: 14, fontWeight: "900" },
  inlineForm: { flexDirection: "row", gap: 8 },
  inlineInput: { flex: 1, minHeight: 46, borderRadius: 14, backgroundColor: v2Theme.colors.surfaceMuted, paddingHorizontal: 12, color: v2Theme.colors.ink, fontSize: 12, fontWeight: "800" },
  squareButton: { width: 46, height: 46, borderRadius: 14, backgroundColor: v2Theme.colors.brand, alignItems: "center", justifyContent: "center" },
  categoryWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  categoryPill: { minHeight: 36, borderRadius: v2Theme.radius.pill, backgroundColor: v2Theme.colors.surfaceMuted, paddingHorizontal: 11, alignItems: "center", justifyContent: "center" },
  categoryPillActive: { backgroundColor: v2Theme.colors.ink },
  categoryText: { color: v2Theme.colors.inkSecondary, fontSize: 9, fontWeight: "900" },
  categoryTextActive: { color: "#FFFFFF" },
  fullInput: { minHeight: 46, borderRadius: 14, backgroundColor: v2Theme.colors.surfaceMuted, paddingHorizontal: 12, color: v2Theme.colors.ink, fontSize: 12, fontWeight: "800" },
  twoColumn: { flexDirection: "row", gap: 8 },
  halfInput: { flex: 1 },
  descriptionInput: { minHeight: 76, paddingTop: 12, textAlignVertical: "top" },
  addItemButton: { minHeight: 46, borderRadius: 14, backgroundColor: v2Theme.colors.brand, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  addItemText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  menuList: { gap: 8 },
  menuItemRow: { minHeight: 68, borderRadius: v2Theme.radius.lg, backgroundColor: v2Theme.colors.surface, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  menuItemIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  menuItemCopy: { flex: 1, gap: 3 },
  menuItemName: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900" },
  menuItemMeta: { color: v2Theme.colors.inkSecondary, fontSize: 9 },
  prep: { color: v2Theme.colors.inkSecondary, fontSize: 9, fontWeight: "900" },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
});
