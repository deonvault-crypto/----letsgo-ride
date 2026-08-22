import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Screen } from "../../../../components/ui/Screen";
import { v2Theme } from "../../../../constants/v2Theme";
import { cancelFoodOrder, getFoodOrder, getFoodOrderEvents } from "../../../../services/foodService";
import { FoodOrder, FoodOrderEvent, FoodOrderStatus } from "../../../../types/food.types";

const ACTIVE_STEPS: Array<{ status: FoodOrderStatus; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = [
  { status: "PLACED", label: "Order placed", icon: "receipt-text-outline" },
  { status: "ACCEPTED", label: "Accepted", icon: "check-circle-outline" },
  { status: "PREPARING", label: "Preparing", icon: "food-outline" },
  { status: "READY_FOR_PICKUP", label: "Ready for pickup", icon: "package-variant-closed" },
  { status: "COURIER_ASSIGNED", label: "Courier assigned", icon: "motorbike" },
  { status: "PICKED_UP", label: "Picked up", icon: "package-up" },
  { status: "OUT_FOR_DELIVERY", label: "On the way", icon: "map-marker-path" },
  { status: "DELIVERED", label: "Delivered", icon: "package-check" },
];

const FINAL_STATUSES = new Set<FoodOrderStatus>(["DELIVERED", "CANCELLED", "REJECTED"]);

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
      const [nextOrder, nextEvents] = await Promise.all([
        getFoodOrder(orderId),
        getFoodOrderEvents(orderId),
      ]);
      setOrder(nextOrder);
      setEvents(nextEvents);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load this order.");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!order || FINAL_STATUSES.has(order.status)) return;
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [order?.status, load]);

  const currentStep = useMemo(() => {
    if (!order) return -1;
    return ACTIVE_STEPS.findIndex((step) => step.status === order.status);
  }, [order]);

  const canCancel = order?.status === "PLACED" || order?.status === "ACCEPTED";

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
      {loading ? <StateCard icon="loading" title="Loading your order" body="Getting the latest restaurant and delivery status…" /> : null}

      {error ? (
        <Pressable accessibilityRole="button" onPress={load} style={styles.errorCard}>
          <MaterialCommunityIcons name="alert-circle-outline" size={22} color={v2Theme.colors.danger} />
          <View style={styles.errorCopy}>
            <Text style={styles.errorTitle}>Something needs attention</Text>
            <Text style={styles.errorBody}>{error}</Text>
          </View>
          <Text style={styles.retry}>Retry</Text>
        </Pressable>
      ) : null}

      {order ? (
        <>
          <OrderHero order={order} />

          {order.status === "CANCELLED" || order.status === "REJECTED" ? (
            <View style={styles.finalAlert}>
              <MaterialCommunityIcons name="close-circle-outline" size={25} color={v2Theme.colors.danger} />
              <View style={styles.finalAlertCopy}>
                <Text style={styles.finalAlertTitle}>{order.status === "CANCELLED" ? "Order cancelled" : "Order declined"}</Text>
                <Text style={styles.finalAlertBody}>{order.cancellation_reason || "This order will not continue to preparation or delivery."}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.progressCard}>
              <View style={styles.progressHeader}>
                <View>
                  <Text style={styles.progressTitle}>Order progress</Text>
                  <Text style={styles.progressSub}>Updates refresh automatically while your order is active.</Text>
                </View>
                <View style={styles.livePill}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>LIVE</Text>
                </View>
              </View>

              <View style={styles.timeline}>
                {ACTIVE_STEPS.map((step, index) => {
                  const complete = currentStep >= index || order.status === "DELIVERED";
                  const active = currentStep === index;
                  return (
                    <View key={step.status} style={styles.stepRow}>
                      <View style={styles.stepRail}>
                        <View style={[styles.stepIcon, complete && styles.stepIconComplete, active && styles.stepIconActive]}>
                          <MaterialCommunityIcons name={step.icon} size={18} color={complete ? "#FFFFFF" : v2Theme.colors.inkTertiary} />
                        </View>
                        {index < ACTIVE_STEPS.length - 1 ? <View style={[styles.stepLine, currentStep > index && styles.stepLineComplete]} /> : null}
                      </View>
                      <View style={styles.stepCopy}>
                        <Text style={[styles.stepTitle, complete && styles.stepTitleComplete]}>{step.label}</Text>
                        {active ? <Text style={styles.stepActiveText}>{statusMessage(order.status)}</Text> : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {order.courier_delivery_id ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Track courier"
              onPress={() => router.push(`/(shared)/courier/${order.courier_delivery_id}` as never)}
              style={({ pressed }) => [styles.trackingCard, pressed && styles.pressed]}
            >
              <View style={styles.trackingIcon}>
                <MaterialCommunityIcons name="map-marker-radius-outline" size={25} color={v2Theme.colors.brandStrong} />
              </View>
              <View style={styles.trackingCopy}>
                <Text style={styles.trackingTitle}>Track your courier</Text>
                <Text style={styles.trackingBody}>Open the live delivery map and courier status.</Text>
              </View>
              <MaterialCommunityIcons name="arrow-right" size={21} color={v2Theme.colors.ink} />
            </Pressable>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your order</Text>
            <View style={styles.itemsCard}>
              {order.items.map((item, index) => (
                <View key={`${item.menu_item_id}-${index}`} style={[styles.itemRow, index > 0 && styles.itemBorder]}>
                  <Text style={styles.itemQty}>{item.quantity}×</Text>
                  <View style={styles.itemCopy}>
                    <Text style={styles.itemName}>{item.name || "Menu item"}</Text>
                    {item.note ? <Text style={styles.itemNote}>{item.note}</Text> : null}
                  </View>
                  <Text style={styles.itemPrice}>${item.line_total_usd.toFixed(2)}</Text>
                </View>
              ))}
              <View style={styles.totalDivider} />
              <PriceRow label="Items subtotal" value={`$${order.subtotal_usd.toFixed(2)}`} />
              <PriceRow label="Delivery" value={order.delivery_fee_usd == null ? "Pending" : `$${order.delivery_fee_usd.toFixed(2)}`} muted={order.delivery_fee_usd == null} />
              {order.total_usd != null ? <PriceRow label="Total" value={`$${order.total_usd.toFixed(2)}`} strong /> : null}
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
                    <View style={styles.eventCopy}>
                      <Text style={styles.eventTitle}>{eventLabel(event.type)}</Text>
                      <Text style={styles.eventTime}>{formatTime(event.created_at)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {canCancel ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel food order"
              onPress={cancel}
              disabled={cancelling}
              style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
            >
              <Text style={styles.cancelText}>{cancelling ? "Cancelling…" : "Cancel order"}</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

function OrderHero({ order }: { order: FoodOrder }) {
  return (
    <View style={styles.heroCard}>
      <View style={styles.heroTop}>
        <View style={styles.heroIcon}>
          <MaterialCommunityIcons name="silverware-fork-knife" size={25} color={v2Theme.colors.brandStrong} />
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.heroEyebrow}>ORDER {order.id.slice(0, 8).toUpperCase()}</Text>
          <Text style={styles.heroTitle}>{order.restaurant_name || "LetsGoRide Food"}</Text>
        </View>
        <StatusPill status={order.status} />
      </View>
      <Text style={styles.heroMessage}>{statusMessage(order.status)}</Text>
      <View style={styles.heroMeta}>
        <Text style={styles.heroMetaText}>{order.items.reduce((total, item) => total + item.quantity, 0)} items</Text>
        <View style={styles.metaDot} />
        <Text style={styles.heroMetaText}>{order.currency || "USD"}</Text>
        {order.created_at ? <><View style={styles.metaDot} /><Text style={styles.heroMetaText}>{formatTime(order.created_at)}</Text></> : null}
      </View>
    </View>
  );
}

function StatusPill({ status }: { status: FoodOrderStatus }) {
  const negative = status === "CANCELLED" || status === "REJECTED";
  const complete = status === "DELIVERED";
  return (
    <View style={[styles.statusPill, negative && styles.statusPillDanger, complete && styles.statusPillSuccess]}>
      <Text style={[styles.statusText, negative && styles.statusTextDanger, complete && styles.statusTextSuccess]}>{status.replaceAll("_", " ")}</Text>
    </View>
  );
}

function PriceRow({ label, value, strong = false, muted = false }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return <View style={styles.priceRow}><Text style={[styles.priceLabel, strong && styles.priceLabelStrong]}>{label}</Text><Text style={[styles.priceValue, strong && styles.priceValueStrong, muted && styles.priceMuted]}>{value}</Text></View>;
}

function DetailRow({ icon, title, body }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; body: string }) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}><MaterialCommunityIcons name={icon} size={20} color={v2Theme.colors.inkSecondary} /></View>
      <View style={styles.detailCopy}><Text style={styles.detailTitle}>{title}</Text><Text style={styles.detailBody}>{body}</Text></View>
    </View>
  );
}

function StateCard({ icon, title, body }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; body: string }) {
  return <View style={styles.stateCard}><MaterialCommunityIcons name={icon} size={24} color={v2Theme.colors.brandStrong} /><View style={styles.errorCopy}><Text style={styles.stateTitle}>{title}</Text><Text style={styles.errorBody}>{body}</Text></View></View>;
}

function statusMessage(status: FoodOrderStatus) {
  const messages: Record<FoodOrderStatus, string> = {
    PLACED: "Waiting for the restaurant to confirm your order.",
    ACCEPTED: "The restaurant accepted your order.",
    PREPARING: "Your food is being prepared now.",
    READY_FOR_PICKUP: "Your order is packed and waiting for courier pickup.",
    COURIER_ASSIGNED: "A courier has been assigned to your order.",
    PICKED_UP: "Your courier collected the order.",
    OUT_FOR_DELIVERY: "Your order is on the way to you.",
    DELIVERED: "Delivered. Enjoy your order.",
    CANCELLED: "This order was cancelled.",
    REJECTED: "The restaurant could not accept this order.",
  };
  return messages[status];
}

function eventLabel(type: string) {
  return type.replace(/^ORDER_/, "").replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, (char) => char.toUpperCase());
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const styles = StyleSheet.create({
  errorCard: { minHeight: 64, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.dangerSoft, padding: 13, flexDirection: "row", alignItems: "center", gap: 10 },
  errorCopy: { flex: 1, gap: 3 },
  errorTitle: { color: v2Theme.colors.danger, fontSize: 12, fontWeight: "900" },
  errorBody: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15 },
  retry: { color: v2Theme.colors.danger, fontSize: 11, fontWeight: "900" },
  stateCard: { minHeight: 68, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.brandSofter, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  stateTitle: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900" },
  heroCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.ink, padding: 18, gap: 13 },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 11 },
  heroIcon: { width: 48, height: 48, borderRadius: 17, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  heroCopy: { flex: 1, gap: 3 },
  heroEyebrow: { color: "rgba(255,255,255,0.62)", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  heroTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "900" },
  heroMessage: { color: "rgba(255,255,255,0.86)", fontSize: 13, lineHeight: 19 },
  heroMeta: { flexDirection: "row", alignItems: "center", gap: 7 },
  heroMetaText: { color: "rgba(255,255,255,0.58)", fontSize: 9, fontWeight: "800" },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.42)" },
  statusPill: { borderRadius: v2Theme.radius.pill, backgroundColor: "rgba(255,255,255,0.12)", paddingHorizontal: 9, paddingVertical: 6 },
  statusPillDanger: { backgroundColor: "rgba(255,110,110,0.17)" },
  statusPillSuccess: { backgroundColor: "rgba(103,220,148,0.18)" },
  statusText: { color: "#FFFFFF", fontSize: 8, fontWeight: "900" },
  statusTextDanger: { color: "#FFB0B0" },
  statusTextSuccess: { color: "#A8EDC1" },
  finalAlert: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.dangerSoft, padding: 15, flexDirection: "row", gap: 11 },
  finalAlertCopy: { flex: 1, gap: 4 },
  finalAlertTitle: { color: v2Theme.colors.danger, fontSize: 14, fontWeight: "900" },
  finalAlertBody: { color: v2Theme.colors.inkSecondary, fontSize: 11, lineHeight: 17 },
  progressCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 16, gap: 16 },
  progressHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  progressTitle: { color: v2Theme.colors.ink, fontSize: 17, fontWeight: "900" },
  progressSub: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15, marginTop: 3, maxWidth: 250 },
  livePill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: v2Theme.colors.brandSoft, borderRadius: v2Theme.radius.pill, paddingHorizontal: 8, paddingVertical: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: v2Theme.colors.success },
  liveText: { color: v2Theme.colors.brandStrong, fontSize: 8, fontWeight: "900" },
  timeline: { gap: 0 },
  stepRow: { minHeight: 58, flexDirection: "row", gap: 12 },
  stepRail: { width: 34, alignItems: "center" },
  stepIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  stepIconComplete: { backgroundColor: v2Theme.colors.brand },
  stepIconActive: { shadowColor: v2Theme.colors.brandStrong, shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  stepLine: { width: 2, flex: 1, backgroundColor: v2Theme.colors.line, marginVertical: 3 },
  stepLineComplete: { backgroundColor: v2Theme.colors.brand },
  stepCopy: { flex: 1, paddingTop: 7 },
  stepTitle: { color: v2Theme.colors.inkTertiary, fontSize: 12, fontWeight: "800" },
  stepTitleComplete: { color: v2Theme.colors.ink, fontWeight: "900" },
  stepActiveText: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15, marginTop: 4 },
  trackingCard: { minHeight: 82, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.brandSofter, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  trackingIcon: { width: 48, height: 48, borderRadius: 17, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" },
  trackingCopy: { flex: 1, gap: 3 },
  trackingTitle: { color: v2Theme.colors.ink, fontSize: 14, fontWeight: "900" },
  trackingBody: { color: v2Theme.colors.inkSecondary, fontSize: 10 },
  section: { gap: 10 },
  sectionTitle: { color: v2Theme.colors.ink, fontSize: 20, fontWeight: "900", letterSpacing: -0.4 },
  itemsCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 14, gap: 10 },
  itemRow: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 8 },
  itemBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: v2Theme.colors.line, paddingTop: 10 },
  itemQty: { width: 26, color: v2Theme.colors.inkSecondary, fontSize: 11, fontWeight: "900" },
  itemCopy: { flex: 1, gap: 2 },
  itemName: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900" },
  itemNote: { color: v2Theme.colors.inkSecondary, fontSize: 9 },
  itemPrice: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900" },
  totalDivider: { height: StyleSheet.hairlineWidth, backgroundColor: v2Theme.colors.line, marginVertical: 2 },
  priceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  priceLabel: { color: v2Theme.colors.inkSecondary, fontSize: 11, fontWeight: "700" },
  priceLabelStrong: { color: v2Theme.colors.ink, fontSize: 13, fontWeight: "900" },
  priceValue: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900" },
  priceValueStrong: { fontSize: 15 },
  priceMuted: { color: v2Theme.colors.warning, fontSize: 10 },
  detailCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, overflow: "hidden" },
  detailRow: { minHeight: 68, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: v2Theme.colors.line },
  detailIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  detailCopy: { flex: 1, gap: 3 },
  detailTitle: { color: v2Theme.colors.inkSecondary, fontSize: 9, fontWeight: "800" },
  detailBody: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "800", lineHeight: 17 },
  eventCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, paddingHorizontal: 14 },
  eventRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 10 },
  eventBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: v2Theme.colors.line },
  eventDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: v2Theme.colors.brand },
  eventCopy: { flex: 1, gap: 3 },
  eventTitle: { color: v2Theme.colors.ink, fontSize: 11, fontWeight: "900" },
  eventTime: { color: v2Theme.colors.inkSecondary, fontSize: 9 },
  cancelButton: { minHeight: 52, borderRadius: v2Theme.radius.lg, backgroundColor: v2Theme.colors.dangerSoft, alignItems: "center", justifyContent: "center" },
  cancelText: { color: v2Theme.colors.danger, fontSize: 12, fontWeight: "900" },
  pressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
});
