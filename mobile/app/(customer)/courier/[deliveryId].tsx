import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

import { DeliveryMap } from "../../../components/maps/DeliveryMap";
import { Screen } from "../../../components/ui/Screen";
import { v2Theme } from "../../../constants/v2Theme";
import {
  cancelCourierDelivery,
  getCourierDelivery,
  getCourierDeliveryPin,
  getCourierEvents,
} from "../../../services/courierService";
import type { CourierDelivery, CourierDeliveryPin, CourierEvent, CourierStatus } from "../../../types/courier.types";

const CAN_CANCEL = new Set<CourierStatus>(["REQUESTED", "MATCHING", "ASSIGNED", "COURIER_TO_PICKUP"]);
const PIN_VISIBLE = new Set<CourierStatus>(["PICKED_UP", "IN_TRANSIT", "ARRIVING"]);
const FINAL = new Set<CourierStatus>(["DELIVERED", "CANCELLED", "FAILED"]);

export default function CustomerCourierDeliveryScreen() {
  const { deliveryId } = useLocalSearchParams<{ deliveryId: string }>();
  const [delivery, setDelivery] = useState<CourierDelivery | null>(null);
  const [events, setEvents] = useState<CourierEvent[]>([]);
  const [handoff, setHandoff] = useState<CourierDeliveryPin | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;
  const statusEntrance = useRef(new Animated.Value(1)).current;

  const load = useCallback(async () => {
    if (!deliveryId) return;
    try {
      const [nextDelivery, nextEvents] = await Promise.all([
        getCourierDelivery(deliveryId),
        getCourierEvents(deliveryId),
      ]);
      setDelivery(nextDelivery);
      setEvents(nextEvents);
      setError(null);
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
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 950, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 950, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  useEffect(() => {
    if (!delivery) return;
    statusEntrance.setValue(0);
    Animated.spring(statusEntrance, {
      toValue: 1,
      damping: 18,
      stiffness: 185,
      mass: 0.82,
      useNativeDriver: true,
    }).start();
  }, [delivery?.status, statusEntrance]);

  useEffect(() => {
    if (!delivery || FINAL.has(delivery.status)) return;
    const timer = setInterval(load, 7000);
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
    return (
      <Screen title="Delivery" showBack fallbackRoute="/(shared)/activity" navRole="customer">
        <DeliveryLoading pulse={pulse} />
      </Screen>
    );
  }

  const animatedStatus = {
    opacity: statusEntrance,
    transform: [{ translateY: statusEntrance.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
  };

  return (
    <Screen title="Delivery" showBack fallbackRoute="/(shared)/activity" navRole="customer">
      {error ? (
        <Pressable accessibilityRole="button" onPress={load} style={styles.errorCard}>
          <MaterialCommunityIcons name="alert-circle-outline" size={21} color={v2Theme.colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.retry}>Retry</Text>
        </Pressable>
      ) : null}

      {delivery ? (
        <>
          <Animated.View style={animatedStatus}>
            <LinearGradient colors={["#102F21", "#164B30", "#1E6A3C"]} style={styles.hero}>
              <View style={styles.heroTop}>
                <View style={styles.heroBadge}>
                  <MaterialCommunityIcons name={delivery.source_type === "FOOD_ORDER" ? "food-takeout-box-outline" : "package-variant-closed"} size={21} color="#E9FFF0" />
                </View>
                <Text style={styles.eyebrow}>{delivery.source_type === "FOOD_ORDER" ? "FOOD DELIVERY" : "COURIER DELIVERY"}</Text>
                {delivery.price_usd != null ? <Text style={styles.price}>${delivery.price_usd.toFixed(2)}</Text> : null}
              </View>
              <Text style={styles.title}>{customerStatusTitle(delivery)}</Text>
              <Text style={styles.body}>{customerStatusBody(delivery)}</Text>
              <View style={styles.statusRow}>
                <View style={styles.statusPill}>
                  <Animated.View style={[styles.statusDot, delivery.live_tracking_active && styles.statusDotLive, delivery.live_tracking_active && { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }) }]} />
                  <Text style={styles.statusText}>{delivery.live_tracking_active ? "LIVE TRACKING" : customerStatusChip(delivery.status)}</Text>
                </View>
                <Text style={styles.orderId}>#{delivery.id.slice(0, 8).toUpperCase()}</Text>
              </View>
            </LinearGradient>
          </Animated.View>

          {isMatching(delivery.status) ? <MatchingSearch pulse={pulse} /> : null}
          {isCourierHeading(delivery.status) ? <CourierFoundCard delivery={delivery} pulse={pulse} /> : null}

          <View style={styles.mapFrame}>
            <DeliveryMap pickup={delivery.pickup_location} dropoff={delivery.dropoff_location} courier={delivery.last_courier_location} height={315} />
            {delivery.live_tracking_active ? (
              <View style={styles.mapLivePill}>
                <MaterialCommunityIcons name="crosshairs-gps" size={15} color={v2Theme.colors.brandStrong} />
                <Text style={styles.mapLiveText}>Courier location updating</Text>
              </View>
            ) : null}
          </View>

          {handoff && PIN_VISIBLE.has(delivery.status) ? (
            <Animated.View style={[styles.pinCard, animatedStatus]}>
              <View style={styles.pinHeader}>
                <View style={styles.pinIcon}><MaterialCommunityIcons name="shield-key-outline" size={27} color={v2Theme.colors.brandStrong} /></View>
                <View style={styles.pinCopy}>
                  <Text style={styles.pinTitle}>Your handoff code</Text>
                  <Text style={styles.pinBody}>Only tell the courier this code when the order is physically with you.</Text>
                </View>
              </View>
              <View style={styles.pinDigits}>
                {handoff.pin.split("").map((digit, index) => <View key={`${digit}-${index}`} style={styles.pinDigit}><Text style={styles.pinDigitText}>{digit}</Text></View>)}
              </View>
              <View style={styles.securityRow}>
                <MaterialCommunityIcons name="map-marker-check-outline" size={19} color={v2Theme.colors.brandStrong} />
                <Text style={styles.securityText}>The code only works when the courier is near your saved drop-off pin.</Text>
              </View>
            </Animated.View>
          ) : null}

          {delivery.status === "DELIVERED" ? <DeliveredCard handoff={handoff} pulse={pulse} /> : null}

          <JourneyCard status={delivery.status} />

          <View style={styles.routeCard}>
            <RouteRow icon="circle-slice-8" label="Pickup" value={delivery.pickup_address} />
            <RouteRow icon="map-marker-outline" label="Drop-off" value={delivery.dropoff_address} />
            {delivery.courier_name ? <RouteRow icon="motorbike" label="Courier" value={delivery.courier_name} /> : null}
            {delivery.estimated_duration_minutes != null ? <RouteRow icon="clock-outline" label="Route estimate" value={`${delivery.estimated_duration_minutes} min`} /> : null}
          </View>

          {CAN_CANCEL.has(delivery.status) ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel delivery" disabled={busy} onPress={cancelDelivery} style={({ pressed }) => [styles.cancelButton, busy && styles.disabled, pressed && styles.pressed]}>
              <Text style={styles.cancelText}>{busy ? "Cancelling…" : "Cancel delivery"}</Text>
            </Pressable>
          ) : null}

          <View style={styles.activityCard}>
            <View style={styles.activityHeader}><Text style={styles.sectionTitle}>Updates</Text><Text style={styles.activityCount}>{events.length}</Text></View>
            {events.slice().reverse().slice(0, 8).map((event, index) => (
              <View key={event.id} style={[styles.eventRow, index > 0 && styles.eventBorder]}>
                <View style={styles.eventDot} />
                <View style={styles.eventCopy}><Text style={styles.eventTitle}>{friendlyEvent(event.type)}</Text><Text style={styles.eventTime}>{formatTime(event.created_at)}</Text></View>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

function DeliveryLoading({ pulse }: { pulse: Animated.Value }) {
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.42, 0.82] });
  return (
    <View style={styles.loadingWrap}>
      <Animated.View style={[styles.loadingHero, { opacity }]} />
      <View style={styles.loadingMap}><MaterialCommunityIcons name="map-outline" size={34} color={v2Theme.colors.brandStrong} /><Text style={styles.loadingText}>Preparing your live delivery view…</Text></View>
      <Animated.View style={[styles.loadingLine, { opacity }]} />
      <Animated.View style={[styles.loadingLineShort, { opacity }]} />
    </View>
  );
}

function MatchingSearch({ pulse }: { pulse: Animated.Value }) {
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1.35] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0.05] });
  return (
    <View style={styles.matchCard}>
      <View style={styles.radar}>
        <Animated.View style={[styles.radarRing, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />
        <View style={styles.radarCore}><MaterialCommunityIcons name="map-marker-radius-outline" size={26} color="#FFFFFF" /></View>
        <View style={[styles.courierDot, styles.courierDotOne]}><MaterialCommunityIcons name="motorbike" size={16} color={v2Theme.colors.brandStrong} /></View>
        <View style={[styles.courierDot, styles.courierDotTwo]}><MaterialCommunityIcons name="bike-fast" size={15} color={v2Theme.colors.brandStrong} /></View>
        <View style={[styles.courierDot, styles.courierDotThree]}><MaterialCommunityIcons name="motorbike" size={15} color={v2Theme.colors.brandStrong} /></View>
      </View>
      <View style={styles.matchCopy}>
        <Text style={styles.matchTitle}>Finding someone nearby…</Text>
        <Text style={styles.matchBody}>We’re checking approved couriers around your pickup. You can leave this screen — the request keeps running.</Text>
        <View style={styles.searchingRow}><Animated.View style={[styles.searchingDot, { opacity: pulse }]} /><Text style={styles.searchingText}>Searching nearby couriers</Text></View>
      </View>
    </View>
  );
}

function CourierFoundCard({ delivery, pulse }: { delivery: CourierDelivery; pulse: Animated.Value }) {
  return (
    <View style={styles.courierCard}>
      <View style={styles.courierAvatar}><MaterialCommunityIcons name="motorbike" size={27} color="#FFFFFF" /></View>
      <View style={styles.courierCopy}>
        <Text style={styles.courierEyebrow}>COURIER FOUND</Text>
        <Text style={styles.courierName}>{delivery.courier_name || "Your courier"}</Text>
        <Text style={styles.courierBody}>Heading to your pickup now. Live location turns on automatically.</Text>
      </View>
      <Animated.View style={[styles.liveBadge, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.65, 1] }) }]}><Text style={styles.liveBadgeText}>LIVE</Text></Animated.View>
    </View>
  );
}

function JourneyCard({ status }: { status: CourierStatus }) {
  const step = journeyStep(status);
  const labels = ["Requested", "Courier", "Collected", "On the way", "Delivered"];
  return (
    <View style={styles.journeyCard}>
      <View style={styles.journeyHeader}><Text style={styles.sectionTitle}>Delivery journey</Text><Text style={styles.journeyNow}>{customerStatusChip(status)}</Text></View>
      <View style={styles.journeyTrack}>
        {labels.map((label, index) => {
          const complete = index <= step;
          const active = index === step && status !== "DELIVERED";
          return (
            <View key={label} style={styles.journeyItem}>
              <View style={styles.journeyTop}>
                <View style={[styles.journeyNode, complete && styles.journeyNodeComplete, active && styles.journeyNodeActive]}>
                  {complete ? <MaterialCommunityIcons name={index === step && active ? "circle-slice-8" : "check"} size={12} color="#FFFFFF" /> : <View style={styles.journeyNodeDot} />}
                </View>
                {index < labels.length - 1 ? <View style={[styles.journeyConnector, index < step && styles.journeyConnectorComplete]} /> : null}
              </View>
              <Text style={[styles.journeyLabel, complete && styles.journeyLabelComplete]}>{label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function DeliveredCard({ handoff, pulse }: { handoff: CourierDeliveryPin | null; pulse: Animated.Value }) {
  return (
    <LinearGradient colors={["#DDF6E5", "#F4FBF6"]} style={styles.successCard}>
      <Animated.View style={[styles.successIcon, { transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.05] }) }] }]}><MaterialCommunityIcons name="check" size={28} color="#FFFFFF" /></Animated.View>
      <View style={styles.successCopy}><Text style={styles.successTitle}>Delivered 💚</Text><Text style={styles.successBody}>{handoff?.verified ? "Recipient code verified. Tracking is closed and the handoff is recorded." : "This delivery is complete."}</Text></View>
    </LinearGradient>
  );
}

function customerStatusTitle(delivery: CourierDelivery) {
  if (isMatching(delivery.status)) return "We’re finding your courier…";
  if (isCourierHeading(delivery.status)) return `${delivery.courier_name || "Your courier"} is on the way to pickup`;
  if (delivery.status === "PICKED_UP" || delivery.status === "IN_TRANSIT") return "Your delivery is moving";
  if (delivery.status === "ARRIVING") return "Almost there";
  if (delivery.status === "DELIVERED") return "Delivered";
  if (delivery.status === "CANCELLED") return "Delivery cancelled";
  return "Delivery needs attention";
}

function customerStatusBody(delivery: CourierDelivery) {
  if (isMatching(delivery.status)) return "We’re checking nearby approved couriers. The search continues even if you leave this screen.";
  if (isCourierHeading(delivery.status)) return "Your courier is heading to the pickup point. Follow their progress here.";
  if (delivery.status === "PICKED_UP" || delivery.status === "IN_TRANSIT") return "Your order has been collected. Live GPS keeps the journey updated automatically.";
  if (delivery.status === "ARRIVING") return "Your courier is close. Keep the 4-digit handoff code ready and only share it when you have the delivery.";
  if (delivery.status === "DELIVERED") return "The handoff is complete and live tracking has stopped.";
  if (delivery.status === "CANCELLED") return "This request has been closed.";
  return "Open support if you need help with this delivery.";
}

function customerStatusChip(status: CourierStatus) {
  if (isMatching(status)) return "Finding courier";
  if (isCourierHeading(status)) return "Heading to pickup";
  if (status === "PICKED_UP" || status === "IN_TRANSIT") return "On the way";
  if (status === "ARRIVING") return "Near you";
  if (status === "DELIVERED") return "Delivered";
  if (status === "CANCELLED") return "Cancelled";
  if (status === "FAILED") return "Needs support";
  return "Preparing";
}

function journeyStep(status: CourierStatus) {
  if (status === "DELIVERED") return 4;
  if (status === "ARRIVING" || status === "IN_TRANSIT") return 3;
  if (status === "PICKED_UP") return 2;
  if (status === "ASSIGNED" || status === "COURIER_TO_PICKUP") return 1;
  return 0;
}

function isMatching(status: CourierStatus) { return status === "REQUESTED" || status === "MATCHING"; }
function isCourierHeading(status: CourierStatus) { return status === "ASSIGNED" || status === "COURIER_TO_PICKUP"; }

function friendlyEvent(value: string) {
  const known: Record<string, string> = {
    DELIVERY_REQUESTED: "Delivery requested",
    DELIVERY_QUOTED: "Route and price confirmed",
    DELIVERY_AUTO_QUOTED: "Route and price confirmed",
    COURIER_CLAIMED_OFFER: "Courier accepted",
    COURIER_ASSIGNED: "Courier assigned",
    STATUS_COURIER_TO_PICKUP: "Courier heading to pickup",
    STATUS_PICKED_UP: "Order collected",
    STATUS_IN_TRANSIT: "On the way",
    STATUS_ARRIVING: "Courier is near you",
    COURIER_DELAY_REPORTED: "Courier sent a delay update",
    DELIVERY_CONFIRMED_BY_PIN: "Delivery code verified",
    DELIVERY_CANCELLED: "Delivery cancelled",
  };
  return known[value] || value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function RouteRow({ icon, label, value }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.routeRow}>
      <View style={styles.routeIcon}><MaterialCommunityIcons name={icon} size={20} color={v2Theme.colors.inkSecondary} /></View>
      <View style={styles.routeCopy}><Text style={styles.routeLabel}>{label}</Text><Text style={styles.routeValue}>{value}</Text></View>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { gap: 12 },
  loadingHero: { height: 170, borderRadius: 28, backgroundColor: v2Theme.colors.surfaceMuted },
  loadingMap: { height: 240, borderRadius: 26, backgroundColor: v2Theme.colors.brandSofter, alignItems: "center", justifyContent: "center", gap: 10 },
  loadingText: { color: v2Theme.colors.inkSecondary, fontSize: 11, fontWeight: "800" },
  loadingLine: { height: 68, borderRadius: 20, backgroundColor: v2Theme.colors.surfaceMuted },
  loadingLineShort: { height: 68, width: "74%", borderRadius: 20, backgroundColor: v2Theme.colors.surfaceMuted },
  errorCard: { borderRadius: 18, backgroundColor: v2Theme.colors.dangerSoft, padding: 13, flexDirection: "row", alignItems: "center", gap: 9 },
  errorText: { flex: 1, color: v2Theme.colors.danger, fontSize: 11, fontWeight: "700" }, retry: { color: v2Theme.colors.danger, fontSize: 10, fontWeight: "900" },
  hero: { borderRadius: 30, padding: 18, gap: 9, overflow: "hidden", shadowColor: "#123F2A", shadowOpacity: 0.2, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 7 },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 8 }, heroBadge: { width: 38, height: 38, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.11)", alignItems: "center", justifyContent: "center" }, eyebrow: { flex: 1, color: "#A8E7BC", fontSize: 9, fontWeight: "900", letterSpacing: 1.1 }, price: { color: "#FFFFFF", fontSize: 17, fontWeight: "900" }, title: { color: "#FFFFFF", fontSize: 27, lineHeight: 32, fontWeight: "900", letterSpacing: -0.8 }, body: { color: "rgba(255,255,255,0.7)", fontSize: 11, lineHeight: 17 },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 }, statusPill: { borderRadius: 999, backgroundColor: "rgba(255,255,255,0.1)", paddingHorizontal: 9, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 6 }, statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.45)" }, statusDotLive: { backgroundColor: "#8FE6AE" }, statusText: { color: "#FFFFFF", fontSize: 8, fontWeight: "900" }, orderId: { color: "rgba(255,255,255,0.45)", fontSize: 8, fontWeight: "900" },
  matchCard: { minHeight: 154, borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.brandSofter, padding: 15, flexDirection: "row", alignItems: "center", gap: 16, overflow: "hidden" }, radar: { width: 116, height: 116, alignItems: "center", justifyContent: "center" }, radarRing: { position: "absolute", width: 86, height: 86, borderRadius: 43, borderWidth: 2, borderColor: v2Theme.colors.brand }, radarCore: { width: 54, height: 54, borderRadius: 27, backgroundColor: v2Theme.colors.brand, alignItems: "center", justifyContent: "center" },
  courierDot: { position: "absolute", width: 34, height: 34, borderRadius: 17, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", shadowColor: v2Theme.colors.shadow, shadowOpacity: 0.12, shadowRadius: 8, elevation: 3 }, courierDotOne: { top: 5, right: 4 }, courierDotTwo: { bottom: 4, left: 1 }, courierDotThree: { bottom: 8, right: 0 }, matchCopy: { flex: 1, gap: 6 }, matchTitle: { color: v2Theme.colors.ink, fontSize: 17, fontWeight: "900", letterSpacing: -0.3 }, matchBody: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15 }, searchingRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 3 }, searchingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: v2Theme.colors.brand }, searchingText: { color: v2Theme.colors.brandStrong, fontSize: 8, fontWeight: "900" },
  courierCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, padding: 14, flexDirection: "row", alignItems: "center", gap: 11, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.brandSoft }, courierAvatar: { width: 54, height: 54, borderRadius: 19, backgroundColor: v2Theme.colors.brand, alignItems: "center", justifyContent: "center" }, courierCopy: { flex: 1, gap: 3 }, courierEyebrow: { color: v2Theme.colors.brandStrong, fontSize: 8, fontWeight: "900", letterSpacing: 0.7 }, courierName: { color: v2Theme.colors.ink, fontSize: 15, fontWeight: "900" }, courierBody: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14 }, liveBadge: { borderRadius: 999, backgroundColor: v2Theme.colors.brandSoft, paddingHorizontal: 8, paddingVertical: 5 }, liveBadgeText: { color: v2Theme.colors.brandStrong, fontSize: 7, fontWeight: "900" },
  mapFrame: { borderRadius: 26, overflow: "hidden", position: "relative" }, mapLivePill: { position: "absolute", left: 12, bottom: 12, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.94)", paddingHorizontal: 10, paddingVertical: 7, flexDirection: "row", alignItems: "center", gap: 6 }, mapLiveText: { color: v2Theme.colors.ink, fontSize: 8, fontWeight: "900" },
  pinCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.brandSofter, padding: 16, gap: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.brandSoft }, pinHeader: { flexDirection: "row", gap: 11, alignItems: "center" }, pinIcon: { width: 50, height: 50, borderRadius: 17, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" }, pinCopy: { flex: 1, gap: 3 }, pinTitle: { color: v2Theme.colors.ink, fontSize: 16, fontWeight: "900" }, pinBody: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15 }, pinDigits: { flexDirection: "row", justifyContent: "center", gap: 9 }, pinDigit: { width: 52, height: 62, borderRadius: 18, backgroundColor: v2Theme.colors.surface, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong }, pinDigitText: { color: v2Theme.colors.ink, fontSize: 27, fontWeight: "900" }, securityRow: { borderRadius: 16, backgroundColor: v2Theme.colors.surface, padding: 11, flexDirection: "row", gap: 8, alignItems: "flex-start" }, securityText: { flex: 1, color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14 },
  successCard: { borderRadius: v2Theme.radius.xl, padding: 14, flexDirection: "row", alignItems: "center", gap: 11 }, successIcon: { width: 52, height: 52, borderRadius: 19, backgroundColor: v2Theme.colors.brand, alignItems: "center", justifyContent: "center" }, successCopy: { flex: 1, gap: 3 }, successTitle: { color: v2Theme.colors.ink, fontSize: 17, fontWeight: "900" }, successBody: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15 },
  journeyCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, padding: 15, gap: 15 }, journeyHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }, journeyNow: { color: v2Theme.colors.brandStrong, fontSize: 9, fontWeight: "900" }, journeyTrack: { flexDirection: "row" }, journeyItem: { flex: 1, minWidth: 0 }, journeyTop: { flexDirection: "row", alignItems: "center" }, journeyNode: { width: 24, height: 24, borderRadius: 12, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" }, journeyNodeComplete: { backgroundColor: v2Theme.colors.brand }, journeyNodeActive: { shadowColor: v2Theme.colors.brand, shadowOpacity: 0.32, shadowRadius: 8, elevation: 3 }, journeyNodeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: v2Theme.colors.inkTertiary }, journeyConnector: { flex: 1, height: 3, backgroundColor: v2Theme.colors.surfaceMuted }, journeyConnectorComplete: { backgroundColor: v2Theme.colors.brand }, journeyLabel: { marginTop: 7, color: v2Theme.colors.inkTertiary, fontSize: 7, lineHeight: 10, fontWeight: "800", paddingRight: 2 }, journeyLabelComplete: { color: v2Theme.colors.ink }, sectionTitle: { color: v2Theme.colors.ink, fontSize: 18, fontWeight: "900" },
  routeCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, overflow: "hidden" }, routeRow: { minHeight: 66, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: v2Theme.colors.line }, routeIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" }, routeCopy: { flex: 1, gap: 3 }, routeLabel: { color: v2Theme.colors.inkSecondary, fontSize: 8, fontWeight: "800" }, routeValue: { color: v2Theme.colors.ink, fontSize: 11, lineHeight: 16, fontWeight: "800" },
  cancelButton: { minHeight: 50, borderRadius: 17, backgroundColor: v2Theme.colors.dangerSoft, alignItems: "center", justifyContent: "center" }, cancelText: { color: v2Theme.colors.danger, fontSize: 11, fontWeight: "900" }, activityCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, paddingHorizontal: 13 }, activityHeader: { minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, activityCount: { color: v2Theme.colors.inkTertiary, fontSize: 9, fontWeight: "900" }, eventRow: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: 10 }, eventBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: v2Theme.colors.line }, eventDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: v2Theme.colors.brand }, eventCopy: { flex: 1, gap: 3 }, eventTitle: { color: v2Theme.colors.ink, fontSize: 10, fontWeight: "900" }, eventTime: { color: v2Theme.colors.inkTertiary, fontSize: 8, fontWeight: "700" }, disabled: { opacity: 0.45 }, pressed: { opacity: 0.72 },
});
