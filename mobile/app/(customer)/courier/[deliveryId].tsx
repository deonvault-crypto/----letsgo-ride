import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { DeliveryMap } from "../../../components/maps/DeliveryMap";
import { Screen } from "../../../components/ui/Screen";
import { v2Theme } from "../../../constants/v2Theme";
import { cancelCourierDelivery, getCourierDelivery, getCourierDeliveryPin, getCourierEvents } from "../../../services/courierService";
import { CourierDelivery, CourierDeliveryPin, CourierEvent } from "../../../types/courier.types";

const CAN_CANCEL = new Set(["REQUESTED", "MATCHING", "ASSIGNED", "COURIER_TO_PICKUP"]);
const PIN_VISIBLE = new Set(["PICKED_UP", "IN_TRANSIT", "ARRIVING"]);

export default function CustomerCourierDeliveryScreen() {
  const router = useRouter();
  const { deliveryId } = useLocalSearchParams<{ deliveryId: string }>();
  const [delivery, setDelivery] = useState<CourierDelivery | null>(null);
  const [events, setEvents] = useState<CourierEvent[]>([]);
  const [handoff, setHandoff] = useState<CourierDeliveryPin | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pulse = useRef(0);

  const load = useCallback(async () => {
    if (!deliveryId) return;
    try {
      setError(null);
      const [nextDelivery, nextEvents] = await Promise.all([
        getCourierDelivery(deliveryId),
        getCourierEvents(deliveryId),
      ]);
      setDelivery(nextDelivery);
      setEvents(nextEvents);
      if (PIN_VISIBLE.has(nextDelivery.status) || nextDelivery.status === "DELIVERED") {
        setHandoff(await getCourierDeliveryPin(deliveryId));
      } else {
        setHandoff(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load this delivery.");
    } finally {
      setLoading(false);
    }
  }, [deliveryId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    if (!delivery || ["DELIVERED", "CANCELLED", "FAILED"].includes(delivery.status)) return;
    const timer = setInterval(load, 9000);
    return () => clearInterval(timer);
  }, [delivery?.status, load]);

  async function cancelDelivery() {
    if (!delivery || busy || !CAN_CANCEL.has(delivery.status)) return;
    try {
      setBusy(true);
      setError(null);
      setDelivery(await cancelCourierDelivery(delivery.id, "Cancelled by customer"));
      setEvents(await getCourierEvents(delivery.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to cancel this delivery.");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !delivery) {
    return <Screen title="Delivery" showBack fallbackRoute="/(shared)/activity" navRole="customer"><Text style={styles.loading}>Preparing your delivery…</Text></Screen>;
  }

  return (
    <Screen title="Delivery" showBack fallbackRoute="/(shared)/activity" navRole="customer">
      {error ? <Pressable accessibilityRole="button" onPress={load} style={styles.errorCard}><MaterialCommunityIcons name="alert-circle-outline" size={21} color={v2Theme.colors.danger} /><Text style={styles.errorText}>{error}</Text><Text style={styles.retry}>Retry</Text></Pressable> : null}

      {delivery ? (
        <>
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>LETSGORIDE COURIER</Text>
            <Text style={styles.title}>{customerStatusTitle(delivery)}</Text>
            <Text style={styles.body}>{customerStatusBody(delivery)}</Text>
            <View style={styles.statusRow}>
              <View style={styles.statusPill}><View style={[styles.statusDot, delivery.live_tracking_active && styles.statusDotLive]} /><Text style={styles.statusText}>{delivery.live_tracking_active ? "LIVE TRACKING" : friendlyStatus(delivery.status)}</Text></View>
              {delivery.price_usd != null ? <Text style={styles.price}>${delivery.price_usd.toFixed(2)}</Text> : null}
            </View>
          </View>

          <DeliveryMap pickup={delivery.pickup_location} dropoff={delivery.dropoff_location} courier={delivery.last_courier_location} height={315} />

          {handoff && PIN_VISIBLE.has(delivery.status) ? (
            <View style={styles.pinCard}>
              <View style={styles.pinHeader}>
                <View style={styles.pinIcon}><MaterialCommunityIcons name="shield-key-outline" size={27} color={v2Theme.colors.brandStrong} /></View>
                <View style={styles.pinCopy}><Text style={styles.pinTitle}>Your delivery code</Text><Text style={styles.pinBody}>Only tell the courier this code when the order is physically with you.</Text></View>
              </View>
              <Text accessibilityLabel={`Delivery code ${handoff.pin.split("").join(" ")}`} style={styles.pin}>{handoff.pin}</Text>
              <View style={styles.securityRow}><MaterialCommunityIcons name="map-marker-check-outline" size={19} color={v2Theme.colors.brandStrong} /><Text style={styles.securityText}>LetsGoRide also checks the courier is near your drop-off pin. The code alone cannot complete the delivery from somewhere else.</Text></View>
            </View>
          ) : null}

          {delivery.status === "DELIVERED" ? (
            <View style={styles.successCard}><View style={styles.successIcon}><MaterialCommunityIcons name="check" size={26} color="#FFFFFF" /></View><View style={styles.successCopy}><Text style={styles.successTitle}>Delivered 💚</Text><Text style={styles.successBody}>{handoff?.verified ? "Recipient code verified and tracking closed." : "This delivery is complete."}</Text></View></View>
          ) : null}

          <View style={styles.routeCard}>
            <RouteRow icon="circle-slice-8" label="Pickup" value={delivery.pickup_address} />
            <RouteRow icon="map-marker-outline" label="Drop-off" value={delivery.dropoff_address} />
            {delivery.courier_name ? <RouteRow icon="motorbike" label="Courier" value={delivery.courier_name} /> : null}
            {delivery.estimated_duration_minutes != null ? <RouteRow icon="clock-outline" label="Route estimate" value={`${delivery.estimated_duration_minutes} min`} /> : null}
          </View>

          <View style={styles.progressCard}>
            <Text style={styles.sectionTitle}>Delivery journey</Text>
            <ProgressRow label="Request confirmed" complete />
            <ProgressRow label="Courier found" complete={!["REQUESTED", "MATCHING"].includes(delivery.status)} />
            <ProgressRow label="Package collected" complete={["PICKED_UP", "IN_TRANSIT", "ARRIVING", "DELIVERED"].includes(delivery.status)} />
            <ProgressRow label="On the way" complete={["IN_TRANSIT", "ARRIVING", "DELIVERED"].includes(delivery.status)} active={delivery.status === "IN_TRANSIT"} />
            <ProgressRow label="Near you" complete={["ARRIVING", "DELIVERED"].includes(delivery.status)} active={delivery.status === "ARRIVING"} />
            <ProgressRow label="Delivered" complete={delivery.status === "DELIVERED"} />
          </View>

          {CAN_CANCEL.has(delivery.status) ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel delivery" disabled={busy} onPress={cancelDelivery} style={({ pressed }) => [styles.cancelButton, busy && styles.disabled, pressed && styles.pressed]}><Text style={styles.cancelText}>{busy ? "Cancelling…" : "Cancel delivery"}</Text></Pressable>
          ) : null}

          <View style={styles.activityCard}>
            <View style={styles.activityHeader}><Text style={styles.sectionTitle}>Updates</Text><Text style={styles.activityCount}>{events.length}</Text></View>
            {events.slice().reverse().slice(0, 8).map((event, index) => <View key={event.id} style={[styles.eventRow, index > 0 && styles.eventBorder]}><View style={styles.eventDot} /><View style={styles.eventCopy}><Text style={styles.eventTitle}>{friendlyEvent(event.type)}</Text><Text style={styles.eventTime}>{formatTime(event.created_at)}</Text></View></View>)}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

function customerStatusTitle(delivery: CourierDelivery) {
  if (delivery.status === "REQUESTED" || delivery.status === "MATCHING") return "We’re finding your courier…";
  if (delivery.status === "ASSIGNED" || delivery.status === "COURIER_TO_PICKUP") return `${delivery.courier_name || "Your courier"} is heading to pickup`;
  if (delivery.status === "PICKED_UP" || delivery.status === "IN_TRANSIT") return "Your parcel is on the way";
  if (delivery.status === "ARRIVING") return "Almost there";
  if (delivery.status === "DELIVERED") return "Delivered";
  if (delivery.status === "CANCELLED") return "Delivery cancelled";
  return "Delivery needs attention";
}

function customerStatusBody(delivery: CourierDelivery) {
  if (delivery.status === "REQUESTED" || delivery.status === "MATCHING") return "We’re checking nearby approved couriers. You can leave this screen and come back anytime.";
  if (delivery.status === "ASSIGNED" || delivery.status === "COURIER_TO_PICKUP") return "Live location starts automatically while the courier heads to your pickup.";
  if (delivery.status === "PICKED_UP" || delivery.status === "IN_TRANSIT") return "The package has been collected. Follow the courier on the map — there are no manual driving stages to wait for.";
  if (delivery.status === "ARRIVING") return "Have your 4-digit handoff code ready, but only share it when you have the delivery.";
  if (delivery.status === "DELIVERED") return "The recipient handoff has been completed and live tracking is off.";
  if (delivery.status === "CANCELLED") return "This request has been closed.";
  return "Open support if you need help with this delivery.";
}

function friendlyStatus(value: string) { return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function friendlyEvent(value: string) {
  const known: Record<string, string> = { DELIVERY_REQUESTED: "Delivery requested", DELIVERY_QUOTED: "Route and price confirmed", DELIVERY_AUTO_QUOTED: "Route and price confirmed", COURIER_CLAIMED_OFFER: "Courier accepted", STATUS_COURIER_TO_PICKUP: "Courier heading to pickup", STATUS_PICKED_UP: "Package collected", STATUS_IN_TRANSIT: "On the way", STATUS_ARRIVING: "Courier is near you", COURIER_DELAY_REPORTED: "Courier reported a delay", DELIVERY_CONFIRMED_BY_PIN: "Delivery code verified", DELIVERY_CANCELLED: "Delivery cancelled" };
  return known[value] || friendlyStatus(value);
}
function formatTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }

function RouteRow({ icon, label, value }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string }) {
  return <View style={styles.routeRow}><View style={styles.routeIcon}><MaterialCommunityIcons name={icon} size={20} color={v2Theme.colors.inkSecondary} /></View><View style={styles.routeCopy}><Text style={styles.routeLabel}>{label}</Text><Text style={styles.routeValue}>{value}</Text></View></View>;
}

function ProgressRow({ label, complete, active = false }: { label: string; complete: boolean; active?: boolean }) {
  return <View style={styles.progressRow}><View style={[styles.progressIcon, complete && styles.progressIconComplete, active && styles.progressIconActive]}>{complete ? <MaterialCommunityIcons name="check" size={14} color="#FFFFFF" /> : <View style={styles.progressDot} />}</View><Text style={[styles.progressText, complete && styles.progressTextComplete]}>{label}</Text>{active ? <View style={styles.activePill}><Text style={styles.activeText}>LIVE</Text></View> : null}</View>;
}

const styles = StyleSheet.create({
  loading: { color: v2Theme.colors.inkSecondary, fontSize: 12 },
  errorCard: { borderRadius: 18, backgroundColor: v2Theme.colors.dangerSoft, padding: 13, flexDirection: "row", alignItems: "center", gap: 9 }, errorText: { flex: 1, color: v2Theme.colors.danger, fontSize: 11, fontWeight: "700" }, retry: { color: v2Theme.colors.danger, fontSize: 10, fontWeight: "900" },
  hero: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.ink, padding: 18, gap: 9 }, eyebrow: { color: "#8FE6AE", fontSize: 9, fontWeight: "900", letterSpacing: 1.1 }, title: { color: "#FFFFFF", fontSize: 27, lineHeight: 32, fontWeight: "900", letterSpacing: -0.8 }, body: { color: "rgba(255,255,255,0.68)", fontSize: 11, lineHeight: 17 }, statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 3 }, statusPill: { borderRadius: 999, backgroundColor: "rgba(255,255,255,0.1)", paddingHorizontal: 9, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 6 }, statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.45)" }, statusDotLive: { backgroundColor: "#8FE6AE" }, statusText: { color: "#FFFFFF", fontSize: 8, fontWeight: "900" }, price: { color: "#FFFFFF", fontSize: 17, fontWeight: "900" },
  pinCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.brandSofter, padding: 16, gap: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.brandSoft }, pinHeader: { flexDirection: "row", gap: 11, alignItems: "center" }, pinIcon: { width: 50, height: 50, borderRadius: 17, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" }, pinCopy: { flex: 1, gap: 3 }, pinTitle: { color: v2Theme.colors.ink, fontSize: 16, fontWeight: "900" }, pinBody: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15 }, pin: { color: v2Theme.colors.ink, fontSize: 38, letterSpacing: 12, textAlign: "center", fontWeight: "900", paddingVertical: 6 }, securityRow: { borderRadius: 16, backgroundColor: v2Theme.colors.surface, padding: 11, flexDirection: "row", gap: 8, alignItems: "flex-start" }, securityText: { flex: 1, color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14 },
  successCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.brandSofter, padding: 14, flexDirection: "row", alignItems: "center", gap: 11 }, successIcon: { width: 48, height: 48, borderRadius: 17, backgroundColor: v2Theme.colors.brand, alignItems: "center", justifyContent: "center" }, successCopy: { flex: 1, gap: 3 }, successTitle: { color: v2Theme.colors.ink, fontSize: 16, fontWeight: "900" }, successBody: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15 },
  routeCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, overflow: "hidden" }, routeRow: { minHeight: 66, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: v2Theme.colors.line }, routeIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" }, routeCopy: { flex: 1, gap: 3 }, routeLabel: { color: v2Theme.colors.inkSecondary, fontSize: 8, fontWeight: "800" }, routeValue: { color: v2Theme.colors.ink, fontSize: 11, lineHeight: 16, fontWeight: "800" },
  progressCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, padding: 15, gap: 11 }, sectionTitle: { color: v2Theme.colors.ink, fontSize: 18, fontWeight: "900" }, progressRow: { minHeight: 34, flexDirection: "row", alignItems: "center", gap: 10 }, progressIcon: { width: 25, height: 25, borderRadius: 13, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" }, progressIconComplete: { backgroundColor: v2Theme.colors.brand }, progressIconActive: { shadowColor: v2Theme.colors.brand, shadowOpacity: 0.3, shadowRadius: 8 }, progressDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: v2Theme.colors.inkTertiary }, progressText: { flex: 1, color: v2Theme.colors.inkSecondary, fontSize: 11, fontWeight: "800" }, progressTextComplete: { color: v2Theme.colors.ink }, activePill: { borderRadius: 999, backgroundColor: v2Theme.colors.brandSoft, paddingHorizontal: 8, paddingVertical: 4 }, activeText: { color: v2Theme.colors.brandStrong, fontSize: 7, fontWeight: "900" },
  cancelButton: { minHeight: 50, borderRadius: 17, backgroundColor: v2Theme.colors.dangerSoft, alignItems: "center", justifyContent: "center" }, cancelText: { color: v2Theme.colors.danger, fontSize: 11, fontWeight: "900" },
  activityCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, paddingHorizontal: 13 }, activityHeader: { minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, activityCount: { color: v2Theme.colors.inkTertiary, fontSize: 9, fontWeight: "900" }, eventRow: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: 10 }, eventBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: v2Theme.colors.line }, eventDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: v2Theme.colors.brand }, eventCopy: { flex: 1, gap: 3 }, eventTitle: { color: v2Theme.colors.ink, fontSize: 10, fontWeight: "900" }, eventTime: { color: v2Theme.colors.inkTertiary, fontSize: 8, fontWeight: "700" },
  disabled: { opacity: 0.45 }, pressed: { opacity: 0.72 },
});
