import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Screen } from "../../../../components/ui/Screen";
import { v2Theme } from "../../../../constants/v2Theme";
import { useLiveRefresh } from "../../../../hooks/useLiveRefresh";
import { cancelFoodOrder, getFoodOrder, getFoodOrderEvents } from "../../../../services/foodService";
import { FoodOrder, FoodOrderEvent } from "../../../../types/food.types";

const FINAL_STATUSES = new Set(["DELIVERED", "CANCELLED", "REJECTED"]);
const PRE_PICKUP_FULFILLMENT = new Set(["NOT_STARTED", "REQUESTED", "MATCHING", "ASSIGNED", "COURIER_ASSIGNED", "COURIER_TO_PICKUP"]);

export default function FoodOrderScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<FoodOrder | null>(null);
  const [events, setEvents] = useState<FoodOrderEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    if (!orderId) return;
    try {
      setError(null);
      const [nextOrder, nextEvents] = await Promise.all([getFoodOrder(orderId), getFoodOrderEvents(orderId)]);
      setOrder(nextOrder);
      setEvents(nextEvents);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load this order.");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useLiveRefresh(load, 10000, !order || !FINAL_STATUSES.has(order.status));

  const canCancel = useMemo(() => {
    if (!order) return false;
    return ["PENDING_RESTAURANT", "PREPARING"].includes(order.restaurant_status || "") && PRE_PICKUP_FULFILLMENT.has(order.fulfillment_status || "NOT_STARTED");
  }, [order]);

  async function cancel() {
    if (!order || !canCancel || cancelling) return;
    try {
      setCancelling(true);
      setError(null);
      setOrder(await cancelFoodOrder(order.id, "Cancelled by customer"));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to cancel this order.");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <Screen showBack fallbackRoute="/(shared)/activity" title="Order" showNotifications={false}>
      {loading ? <StateCard icon="clock-outline" title="Opening your order" body="Getting the latest kitchen and courier updates…" /> : null}

      {error ? (
        <Pressable accessibilityRole="button" onPress={load} style={styles.errorCard}>
          <MaterialCommunityIcons name="alert-circle-outline" size={22} color={v2Theme.colors.danger} />
          <View style={styles.flexCopy}><Text style={styles.errorTitle}>Something needs attention</Text><Text style={styles.errorBody}>{error}</Text></View>
          <Text style={styles.retry}>Retry</Text>
        </Pressable>
      ) : null}

      {order ? (
        <>
          <View style={styles.heroCard}>
            <View style={styles.heroTop}>
              <View style={styles.heroIcon}><MaterialCommunityIcons name="silverware-fork-knife" size={25} color="#FFFFFF" /></View>
              <View style={styles.flexCopy}>
                <Text style={styles.heroEyebrow}>ORDER {order.id.slice(0, 8).toUpperCase()}</Text>
                <Text style={styles.heroTitle}>{order.restaurant_name || "LetsGoRide Food"}</Text>
              </View>
              <View style={[styles.statusPill, order.status === "DELIVERED" && styles.statusPillDone]}>
                <Text style={[styles.statusText, order.status === "DELIVERED" && styles.statusTextDone]}>{customerHeadline(order)}</Text>
              </View>
            </View>
            <Text style={styles.heroBody}>{customerMessage(order)}</Text>
          </View>

          {order.status === "CANCELLED" || order.status === "REJECTED" ? (
            <View style={styles.finalAlert}>
              <MaterialCommunityIcons name="close-circle-outline" size={25} color={v2Theme.colors.danger} />
              <View style={styles.flexCopy}>
                <Text style={styles.finalAlertTitle}>Order closed</Text>
                <Text style={styles.finalAlertBody}>{order.cancellation_reason || "This order is no longer active."}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.parallelCard}>
              <View style={styles.parallelHeader}>
                <View><Text style={styles.parallelTitle}>Live order</Text><Text style={styles.parallelSub}>{order.restaurant_status === "PENDING_RESTAURANT" ? "Waiting for the restaurant to respond." : "Kitchen and courier move at the same time."}</Text></View>
              </View>

              <View style={styles.trackRow}>
                <TrackCard
                  icon="chef-hat"
                  eyebrow="KITCHEN"
                  title={kitchenTitle(order)}
                  body={kitchenBody(order)}
                  complete={order.restaurant_status === "READY_FOR_PICKUP" || order.status === "DELIVERED"}
                />
                <TrackCard
                  icon="motorbike"
                  eyebrow="COURIER"
                  title={courierTitle(order.fulfillment_status)}
                  body={courierBody(order.fulfillment_status)}
                  complete={order.fulfillment_status === "DELIVERED" || order.status === "DELIVERED"}
                />
              </View>
            </View>
          )}

          {order.courier_delivery_id ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Track courier" onPress={() => router.push(`/(shared)/courier/${order.courier_delivery_id}` as never)} style={({ pressed }) => [styles.trackingCard, pressed && styles.pressed]}>
              <View style={styles.trackingIcon}><MaterialCommunityIcons name="map-marker-radius-outline" size={25} color={v2Theme.colors.brandStrong} /></View>
              <View style={styles.flexCopy}><Text style={styles.trackingTitle}>Live courier tracking</Text><Text style={styles.trackingBody}>See the courier on the map and get your secure 4-digit handoff code when needed.</Text></View>
              <MaterialCommunityIcons name="arrow-right" size={21} color={v2Theme.colors.ink} />
            </Pressable>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your order</Text>
            <View style={styles.itemsCard}>
              {order.items.map((item, index) => (
                <View key={`${item.menu_item_id}-${index}`} style={[styles.itemRow, index > 0 && styles.itemBorder]}>
                  <Text style={styles.itemQty}>{item.quantity}×</Text>
                  <View style={styles.itemCopy}><Text style={styles.itemName}>{item.name || "Menu item"}</Text>{item.note ? <Text style={styles.itemNote}>{item.note}</Text> : null}</View>
                  <Text style={styles.itemPrice}>${item.line_total_usd.toFixed(2)}</Text>
                </View>
              ))}
              <View style={styles.totalDivider} />
              <PriceRow label="Items subtotal" value={`$${order.subtotal_usd.toFixed(2)}`} />
              <PriceRow label="Delivery" value={order.delivery_fee_usd == null ? "Calculating" : `$${order.delivery_fee_usd.toFixed(2)}`} muted={order.delivery_fee_usd == null} />
              {order.total_usd != null ? <PriceRow label="Total" value={`$${order.total_usd.toFixed(2)}`} strong /> : null}
              <View style={styles.paymentStrip}><MaterialCommunityIcons name="cash" size={18} color={v2Theme.colors.brandStrong} /><Text style={styles.paymentText}>Pay on delivery</Text></View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Delivery details</Text>
            <View style={styles.detailCard}>
              <DetailRow icon="map-marker-outline" title="Deliver to" body={order.delivery_address} />
              <DetailRow icon="account-outline" title="Recipient" body={order.recipient_name} />
              <DetailRow icon="phone-outline" title="Phone" body={order.recipient_phone} />
              {order.customer_note ? <DetailRow icon="note-text-outline" title="Order note" body={order.customer_note} /> : null}
            </View>
          </View>

          {events.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Activity</Text>
              <View style={styles.eventCard}>
                {events.slice().reverse().slice(0, 8).map((event, index) => (
                  <View key={event.id} style={[styles.eventRow, index > 0 && styles.eventBorder]}>
                    <View style={styles.eventDot} />
                    <View style={styles.flexCopy}><Text style={styles.eventTitle}>{eventLabel(event.type)}</Text><Text style={styles.eventTime}>{formatTime(event.created_at)}</Text></View>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {canCancel ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel food order" onPress={cancel} disabled={cancelling} style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}>
              <Text style={styles.cancelText}>{cancelling ? "Cancelling…" : "Cancel order"}</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

function TrackCard({ icon, eyebrow, title, body, complete }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; eyebrow: string; title: string; body: string; complete: boolean }) {
  return (
    <View style={[styles.trackCard, complete && styles.trackCardDone]}>
      <View style={[styles.trackIcon, complete && styles.trackIconDone]}><MaterialCommunityIcons name={complete ? "check" : icon} size={22} color={complete ? "#FFFFFF" : v2Theme.colors.brandStrong} /></View>
      <Text style={styles.trackEyebrow}>{eyebrow}</Text>
      <Text style={styles.trackTitle}>{title}</Text>
      <Text style={styles.trackBody}>{body}</Text>
    </View>
  );
}

function customerHeadline(order: FoodOrder) {
  if (order.status === "DELIVERED") return "Delivered";
  if (order.status === "CANCELLED" || order.status === "REJECTED") return "Closed";
  if (["PICKED_UP", "OUT_FOR_DELIVERY"].includes(order.fulfillment_status || "")) return "On the way";
  if (order.restaurant_status === "PENDING_RESTAURANT") return "Awaiting acceptance";
  return "In progress";
}

function customerMessage(order: FoodOrder) {
  if (order.status === "DELIVERED") return "Delivered. Enjoy your order 💚";
  if (order.status === "CANCELLED" || order.status === "REJECTED") return "This order is no longer active.";
  if (order.fulfillment_status === "ARRIVING") return "Your courier is almost there. Have your handoff code ready.";
  if (["PICKED_UP", "OUT_FOR_DELIVERY", "IN_TRANSIT"].includes(order.fulfillment_status || "")) return "Your food has been collected and is on the way.";
  if (order.restaurant_status === "READY_FOR_PICKUP") return "The kitchen is done. Your courier can collect the order now.";
  if (order.restaurant_status === "PENDING_RESTAURANT") return "Your order has been sent to the restaurant for acceptance.";
  return "The kitchen is preparing your food while LetsGoRide matches a courier in parallel.";
}

function kitchenTitle(order: FoodOrder) {
  if (order.status === "DELIVERED") return "Completed";
  if (order.restaurant_status === "READY_FOR_PICKUP") return "Ready for pickup";
  if (order.restaurant_status === "PENDING_RESTAURANT") return "Awaiting restaurant";
  return "Preparing your food";
}

function kitchenBody(order: FoodOrder) {
  if (order.restaurant_status === "READY_FOR_PICKUP") return "Packed and waiting for courier collection.";
  if (order.restaurant_status === "PENDING_RESTAURANT") return "The restaurant needs to accept the order before preparation starts.";
  return "The restaurant accepted your order and started preparing it.";
}

function courierTitle(status?: string) {
  if (!status || status === "NOT_STARTED") return "Starts after acceptance";
  if (status === "REQUESTED" || status === "MATCHING") return "Finding your courier";
  if (["ASSIGNED", "COURIER_ASSIGNED", "COURIER_TO_PICKUP"].includes(status)) return "Courier heading to pickup";
  if (status === "PICKED_UP") return "Food collected";
  if (["OUT_FOR_DELIVERY", "IN_TRANSIT"].includes(status)) return "On the way";
  if (status === "ARRIVING") return "Almost there";
  if (status === "DELIVERED") return "Delivered";
  return status.replaceAll("_", " ").toLowerCase();
}

function courierBody(status?: string) {
  if (!status || status === "NOT_STARTED") return "Courier matching will begin as soon as the restaurant accepts.";
  if (status === "REQUESTED" || status === "MATCHING") return "Matching runs while the kitchen prepares.";
  if (["ASSIGNED", "COURIER_ASSIGNED", "COURIER_TO_PICKUP"].includes(status)) return "The courier is travelling to the restaurant.";
  if (status === "PICKED_UP") return "The courier confirmed collection.";
  if (["OUT_FOR_DELIVERY", "IN_TRANSIT", "ARRIVING"].includes(status)) return "Follow the courier live on the map.";
  if (status === "DELIVERED") return "Handoff verified securely.";
  return "Live delivery updates appear here.";
}

function PriceRow({ label, value, strong = false, muted = false }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return <View style={styles.priceRow}><Text style={[styles.priceLabel, strong && styles.priceLabelStrong]}>{label}</Text><Text style={[styles.priceValue, strong && styles.priceValueStrong, muted && styles.priceMuted]}>{value}</Text></View>;
}

function DetailRow({ icon, title, body }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; body: string }) {
  return <View style={styles.detailRow}><View style={styles.detailIcon}><MaterialCommunityIcons name={icon} size={20} color={v2Theme.colors.inkSecondary} /></View><View style={styles.flexCopy}><Text style={styles.detailTitle}>{title}</Text><Text style={styles.detailBody}>{body}</Text></View></View>;
}

function StateCard({ icon, title, body }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; body: string }) {
  return <View style={styles.stateCard}><MaterialCommunityIcons name={icon} size={24} color={v2Theme.colors.brandStrong} /><View style={styles.flexCopy}><Text style={styles.stateTitle}>{title}</Text><Text style={styles.errorBody}>{body}</Text></View></View>;
}

function eventLabel(type: string) {
  const labels: Record<string, string> = {
    ORDER_PLACED: "Order sent to restaurant",
    ORDER_CONFIRMED: "Order confirmed",
    RESTAURANT_PREPARING: "Kitchen started preparing",
    COURIER_FULFILLMENT_CREATED: "Courier search opened",
    COURIER_MATCHING_STARTED: "Finding a courier",
    RESTAURANT_READY_FOR_PICKUP: "Food ready for pickup",
    FULFILLMENT_COURIER_ASSIGNED: "Courier assigned",
    FULFILLMENT_COURIER_TO_PICKUP: "Courier heading to restaurant",
    FULFILLMENT_PICKED_UP: "Courier collected the food",
    FULFILLMENT_OUT_FOR_DELIVERY: "Food is on the way",
    FULFILLMENT_ARRIVING: "Courier is almost there",
    FULFILLMENT_DELIVERED: "Delivered",
    ORDER_CANCELLED: "Order cancelled",
  };
  return labels[type] || type.replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, (char) => char.toUpperCase());
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const styles = StyleSheet.create({
  flexCopy: { flex: 1, gap: 3 },
  errorCard: { minHeight: 64, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.dangerSoft, padding: 13, flexDirection: "row", alignItems: "center", gap: 10 }, errorTitle: { color: v2Theme.colors.danger, fontSize: 12, fontWeight: "900" }, errorBody: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15 }, retry: { color: v2Theme.colors.danger, fontSize: 11, fontWeight: "900" },
  stateCard: { minHeight: 68, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.brandSofter, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 }, stateTitle: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900" },
  heroCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.ink, padding: 18, gap: 12 }, heroTop: { flexDirection: "row", alignItems: "center", gap: 11 }, heroIcon: { width: 48, height: 48, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" }, heroEyebrow: { color: "#8FE6AE", fontSize: 8, fontWeight: "900", letterSpacing: 1 }, heroTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "900" }, heroBody: { color: "rgba(255,255,255,0.7)", fontSize: 11, lineHeight: 17 }, statusPill: { borderRadius: 999, backgroundColor: "rgba(255,255,255,0.1)", paddingHorizontal: 8, paddingVertical: 6 }, statusPillDone: { backgroundColor: "#E9F8EF" }, statusText: { color: "#FFFFFF", fontSize: 7, fontWeight: "900" }, statusTextDone: { color: v2Theme.colors.brandStrong },
  finalAlert: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.dangerSoft, padding: 14, flexDirection: "row", gap: 10, alignItems: "center" }, finalAlertTitle: { color: v2Theme.colors.danger, fontSize: 13, fontWeight: "900" }, finalAlertBody: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15 },
  parallelCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 14, gap: 12 }, parallelHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, parallelTitle: { color: v2Theme.colors.ink, fontSize: 17, fontWeight: "900" }, parallelSub: { color: v2Theme.colors.inkSecondary, fontSize: 9, marginTop: 2 }, livePill: { borderRadius: 999, backgroundColor: v2Theme.colors.brandSofter, paddingHorizontal: 8, paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 5 }, liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: v2Theme.colors.success }, liveText: { color: v2Theme.colors.brandStrong, fontSize: 7, fontWeight: "900" },
  trackRow: { flexDirection: "row", gap: 9 }, trackCard: { flex: 1, minHeight: 150, borderRadius: 18, backgroundColor: v2Theme.colors.surfaceMuted, padding: 12, gap: 6 }, trackCardDone: { backgroundColor: v2Theme.colors.brandSofter }, trackIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" }, trackIconDone: { backgroundColor: v2Theme.colors.brand }, trackEyebrow: { color: v2Theme.colors.brandStrong, fontSize: 7, fontWeight: "900", letterSpacing: 0.8 }, trackTitle: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900" }, trackBody: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14 },
  trackingCard: { minHeight: 82, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.brandSofter, padding: 13, flexDirection: "row", alignItems: "center", gap: 11 }, trackingIcon: { width: 47, height: 47, borderRadius: 16, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" }, trackingTitle: { color: v2Theme.colors.ink, fontSize: 13, fontWeight: "900" }, trackingBody: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14 },
  section: { gap: 10 }, sectionTitle: { color: v2Theme.colors.ink, fontSize: 19, fontWeight: "900" },
  itemsCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 14, gap: 8 }, itemRow: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8 }, itemBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: v2Theme.colors.line }, itemQty: { width: 24, color: v2Theme.colors.brandStrong, fontSize: 11, fontWeight: "900" }, itemCopy: { flex: 1, gap: 2 }, itemName: { color: v2Theme.colors.ink, fontSize: 11, fontWeight: "900" }, itemNote: { color: v2Theme.colors.inkSecondary, fontSize: 8 }, itemPrice: { color: v2Theme.colors.ink, fontSize: 11, fontWeight: "900" }, totalDivider: { height: StyleSheet.hairlineWidth, backgroundColor: v2Theme.colors.line, marginVertical: 3 }, priceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, priceLabel: { color: v2Theme.colors.inkSecondary, fontSize: 10, fontWeight: "800" }, priceLabelStrong: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900" }, priceValue: { color: v2Theme.colors.ink, fontSize: 11, fontWeight: "900" }, priceValueStrong: { fontSize: 14 }, priceMuted: { color: v2Theme.colors.warning }, paymentStrip: { minHeight: 40, borderRadius: 13, backgroundColor: v2Theme.colors.brandSofter, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 8 }, paymentText: { color: v2Theme.colors.ink, fontSize: 9, fontWeight: "900" },
  detailCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, overflow: "hidden" }, detailRow: { minHeight: 62, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: v2Theme.colors.line }, detailIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" }, detailTitle: { color: v2Theme.colors.inkSecondary, fontSize: 8, fontWeight: "800" }, detailBody: { color: v2Theme.colors.ink, fontSize: 10, lineHeight: 15, fontWeight: "800" },
  eventCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, paddingHorizontal: 13 }, eventRow: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 9 }, eventBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: v2Theme.colors.line }, eventDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: v2Theme.colors.brand }, eventTitle: { color: v2Theme.colors.ink, fontSize: 10, fontWeight: "900" }, eventTime: { color: v2Theme.colors.inkTertiary, fontSize: 8, fontWeight: "700" },
  cancelButton: { minHeight: 50, borderRadius: 17, backgroundColor: v2Theme.colors.dangerSoft, alignItems: "center", justifyContent: "center" }, cancelText: { color: v2Theme.colors.danger, fontSize: 11, fontWeight: "900" }, pressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
});
