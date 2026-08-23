import { Alert, Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { DeliveryMap } from "../../../components/maps/DeliveryMap";
import { Screen } from "../../../components/ui/Screen";
import { v2Theme } from "../../../constants/v2Theme";
import {
  cancelCourierDelivery,
  getCourierDelivery,
  getCourierEvents,
  getCourierTracking,
} from "../../../services/courierService";
import { CourierDelivery, CourierEvent, CourierStatus, CourierTrackingState } from "../../../types/courier.types";

const progressStatuses: CourierStatus[] = [
  "MATCHING",
  "ASSIGNED",
  "COURIER_TO_PICKUP",
  "PICKED_UP",
  "IN_TRANSIT",
  "ARRIVING",
  "DELIVERED",
];

const cancellableStatuses = new Set<CourierStatus>(["REQUESTED", "MATCHING", "ASSIGNED", "COURIER_TO_PICKUP"]);

export default function CourierDeliveryScreen() {
  const { deliveryId } = useLocalSearchParams<{ deliveryId: string }>();
  const [delivery, setDelivery] = useState<CourierDelivery | null>(null);
  const [tracking, setTracking] = useState<CourierTrackingState | null>(null);
  const [events, setEvents] = useState<CourierEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const statusTransition = useRef(new Animated.Value(1)).current;
  const previousStatus = useRef<CourierStatus | null>(null);

  const load = useCallback(async () => {
    if (!deliveryId) return;
    try {
      setError(null);
      const [nextDelivery, nextTracking, nextEvents] = await Promise.all([
        getCourierDelivery(deliveryId),
        getCourierTracking(deliveryId),
        getCourierEvents(deliveryId),
      ]);
      setDelivery(nextDelivery);
      setTracking(nextTracking);
      setEvents(nextEvents);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load delivery.");
    } finally {
      setLoading(false);
    }
  }, [deliveryId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 7000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!delivery?.status || previousStatus.current === delivery.status) return;
    previousStatus.current = delivery.status;
    statusTransition.setValue(0);
    Animated.spring(statusTransition, {
      toValue: 1,
      useNativeDriver: true,
      damping: 17,
      stiffness: 180,
      mass: 0.8,
    }).start();
  }, [delivery?.status, statusTransition]);

  async function cancel() {
    if (!delivery || cancelling || !cancellableStatuses.has(delivery.status)) return;
    Alert.alert(
      "Cancel this delivery?",
      "The courier request will stop and cannot be resumed.",
      [
        { text: "Keep delivery", style: "cancel" },
        {
          text: "Cancel delivery",
          style: "destructive",
          onPress: async () => {
            try {
              setCancelling(true);
              setError(null);
              const updated = await cancelCourierDelivery(delivery.id, "Cancelled by sender");
              setDelivery(updated);
              setTracking(await getCourierTracking(delivery.id));
              setEvents(await getCourierEvents(delivery.id));
            } catch (err) {
              setError(err instanceof Error ? err.message : "Unable to cancel this delivery.");
            } finally {
              setCancelling(false);
            }
          },
        },
      ],
    );
  }

  const pickup = delivery?.pickup_location || null;
  const dropoff = delivery?.dropoff_location || null;
  const courier = tracking?.last_courier_location || null;
  const canCancel = Boolean(delivery && cancellableStatuses.has(delivery.status));
  const statusAnimatedStyle = {
    opacity: statusTransition,
    transform: [
      { translateY: statusTransition.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
      { scale: statusTransition.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] }) },
    ],
  };

  return (
    <Screen showBack fallbackRoute="/(shared)/activity" title="Delivery" showNotifications={false}>
      {loading ? <LoadingState /> : null}

      {error ? (
        <Pressable accessibilityRole="button" onPress={load} style={styles.errorCard}>
          <MaterialCommunityIcons name="alert-circle-outline" size={23} color={v2Theme.colors.danger} />
          <View style={styles.stateCopy}>
            <Text style={styles.errorTitle}>Couldn’t refresh this delivery</Text>
            <Text style={styles.stateBody}>{error}</Text>
          </View>
          <Text style={styles.retry}>Retry</Text>
        </Pressable>
      ) : null}

      {delivery ? (
        <>
          <Animated.View style={statusAnimatedStyle}>
            <StatusHero delivery={delivery} />
          </Animated.View>

          {(delivery.status === "REQUESTED" || delivery.status === "MATCHING") ? <CourierSearchAnimation /> : null}

          {delivery.price_usd != null ? (
            <View style={styles.commercialCard}>
              <View style={styles.priceBlock}>
                <Text style={styles.commercialEyebrow}>YOUR DELIVERY</Text>
                <Text style={styles.price}>${delivery.price_usd.toFixed(2)}</Text>
                <Text style={styles.currency}>{delivery.currency || "USD"}</Text>
              </View>
              <View style={styles.commercialFacts}>
                <CommercialFact icon="map-marker-distance" label="Distance" value={delivery.distance_km != null ? `${delivery.distance_km.toFixed(1)} km` : "—"} />
                <CommercialFact icon="clock-outline" label="Route estimate" value={delivery.estimated_duration_minutes != null ? `${delivery.estimated_duration_minutes} min` : "—"} />
              </View>
            </View>
          ) : null}

          <DeliveryMap pickup={pickup} dropoff={dropoff} courier={courier} height={300} />

          <ProgressTimeline status={delivery.status} />

          <View style={styles.routeCard}>
            <RouteRow icon="circle-slice-8" label="Pickup" value={delivery.pickup_address} brand />
            <View style={styles.divider} />
            <RouteRow icon="map-marker" label="Drop-off" value={delivery.dropoff_address} />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Courier</Text>
            <Animated.View style={[styles.courierCard, delivery.courier_user_id ? styles.courierCardAssigned : null, statusAnimatedStyle]}>
              <View style={[styles.courierAvatar, delivery.courier_user_id ? styles.courierAvatarAssigned : null]}>
                <MaterialCommunityIcons name={delivery.courier_user_id ? "motorbike" : "radar"} size={26} color={delivery.courier_user_id ? "#FFFFFF" : v2Theme.colors.brandStrong} />
              </View>
              <View style={styles.courierCopy}>
                <Text style={styles.courierTitle}>{delivery.courier_name || "Finding someone nearby…"}</Text>
                <Text style={styles.courierBody}>{delivery.courier_user_id ? courierMessage(delivery.status) : "We’re checking approved couriers who can take this route."}</Text>
              </View>
              {delivery.courier_user_id ? <MaterialCommunityIcons name="check-decagram" size={21} color={v2Theme.colors.brandStrong} /> : null}
            </Animated.View>
          </View>

          <LiveTrackingCard tracking={tracking} status={delivery.status} />

          <View style={styles.detailsGrid}>
            <DetailCard icon="package-variant-closed" label="Package" value={formatPackageType(delivery.package_type)} />
            <DetailCard icon="account-outline" label="Recipient" value={delivery.recipient_name} />
            <DetailCard icon="phone-outline" label="Recipient phone" value={delivery.recipient_phone} />
            <DetailCard icon="shield-check-outline" label="Now" value={humanStatus(delivery.status)} />
          </View>

          {events.length ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Activity</Text><Text style={styles.eventCount}>{events.length} updates</Text></View>
              <View style={styles.eventCard}>
                {events.slice().reverse().slice(0, 8).map((event, index) => (
                  <View key={event.id} style={[styles.eventRow, index > 0 && styles.eventBorder]}>
                    <View style={styles.eventDot} />
                    <View style={styles.eventCopy}><Text style={styles.eventTitle}>{formatEvent(event.type)}</Text><Text style={styles.eventTime}>{formatTime(event.created_at)}</Text></View>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {canCancel ? (
            <Pressable accessibilityRole="button" disabled={cancelling} onPress={cancel} style={({ pressed }) => [styles.cancelButton, cancelling && styles.disabled, pressed && !cancelling && styles.pressed]}>
              <MaterialCommunityIcons name="close-circle-outline" size={20} color={v2Theme.colors.danger} />
              <Text style={styles.cancelText}>{cancelling ? "Cancelling…" : "Cancel delivery"}</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

function StatusHero({ delivery }: { delivery: CourierDelivery }) {
  const terminal = delivery.status === "DELIVERED" || delivery.status === "CANCELLED" || delivery.status === "FAILED";
  const colors = delivery.status === "DELIVERED"
    ? ["#0C3B25", "#147A41", "#32A866"] as const
    : delivery.status === "CANCELLED" || delivery.status === "FAILED"
      ? ["#353B37", "#555E58"] as const
      : ["#123F2A", "#176E3D", "#299859"] as const;

  return (
    <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
      <View style={styles.statusRow}>
        <View style={[styles.statusPill, terminal && styles.statusPillTerminal]}>
          <View style={[styles.statusDot, terminal && styles.statusDotTerminal]} />
          <Text style={styles.statusText}>{humanStatus(delivery.status)}</Text>
        </View>
        <Text style={styles.reference}>#{delivery.id.slice(0, 8).toUpperCase()}</Text>
      </View>
      <View style={styles.heroMain}>
        <View style={styles.heroStatusIcon}>
          <MaterialCommunityIcons name={statusIcon(delivery.status)} size={29} color="#FFFFFF" />
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.title}>{headline(delivery.status)}</Text>
          <Text style={styles.body}>{statusMessage(delivery.status)}</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

function CourierSearchAnimation() {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1250, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const ringStyle = {
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.65, 1.55] }) }],
  };

  return (
    <View style={styles.searchCard}>
      <View style={styles.radarStage}>
        <Animated.View style={[styles.radarRing, ringStyle]} />
        <View style={styles.radarCore}><MaterialCommunityIcons name="package-variant-closed" size={23} color="#FFFFFF" /></View>
        <View style={[styles.courierDot, styles.courierDotOne]}><MaterialCommunityIcons name="motorbike" size={13} color={v2Theme.colors.brandStrong} /></View>
        <View style={[styles.courierDot, styles.courierDotTwo]}><MaterialCommunityIcons name="bike-fast" size={12} color={v2Theme.colors.brandStrong} /></View>
        <View style={[styles.courierDot, styles.courierDotThree]}><MaterialCommunityIcons name="motorbike" size={12} color={v2Theme.colors.brandStrong} /></View>
      </View>
      <View style={styles.searchCopy}>
        <Text style={styles.searchTitle}>Finding someone nearby…</Text>
        <Text style={styles.searchBody}>We’ll update this screen automatically as soon as an approved courier accepts.</Text>
      </View>
      <View style={styles.searchDots}><View style={styles.searchDot} /><View style={[styles.searchDot, styles.searchDotSoft]} /><View style={[styles.searchDot, styles.searchDotSofter]} /></View>
    </View>
  );
}

function LiveTrackingCard({ tracking, status }: { tracking: CourierTrackingState | null; status: CourierStatus }) {
  const pulse = useRef(new Animated.Value(0.5)).current;
  const live = Boolean(tracking?.live_tracking_active && tracking?.last_courier_location);

  useEffect(() => {
    if (!live) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 750, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [live, pulse]);

  return (
    <View style={styles.trackingCard}>
      <View style={[styles.trackingIcon, live && styles.trackingIconActive]}>
        <MaterialCommunityIcons name={live ? "crosshairs-gps" : "map-marker-off-outline"} size={24} color={live ? "#FFFFFF" : v2Theme.colors.inkSecondary} />
      </View>
      <View style={styles.stateCopy}>
        <Text style={styles.trackingTitle}>{live ? "Courier location is live" : trackingMessage(status)}</Text>
        <Text style={styles.stateBody}>{live ? "The courier marker refreshes as new GPS positions arrive." : "Live location appears automatically during the active courier journey."}</Text>
      </View>
      <View style={[styles.liveIndicator, live && styles.liveIndicatorActive]}>
        <Animated.View style={[styles.liveDot, live && styles.liveDotActive, live ? { opacity: pulse } : null]} />
        <Text style={[styles.liveText, live && styles.liveTextActive]}>{live ? "LIVE" : "OFF"}</Text>
      </View>
    </View>
  );
}

function LoadingState() {
  const fade = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(fade, { toValue: 0.85, duration: 650, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 0.35, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [fade]);

  return (
    <Animated.View style={[styles.stateCard, { opacity: fade }]}>
      <View style={styles.loadingIcon}><MaterialCommunityIcons name="package-variant-closed" size={23} color={v2Theme.colors.brandStrong} /></View>
      <View style={styles.stateCopy}><Text style={styles.stateTitle}>Opening your delivery…</Text><Text style={styles.stateBody}>Syncing courier, route and live tracking.</Text></View>
    </Animated.View>
  );
}

function ProgressTimeline({ status }: { status: CourierStatus }) {
  if (status === "CANCELLED" || status === "FAILED") return null;
  const currentIndex = status === "REQUESTED" ? -1 : progressStatuses.indexOf(status);
  return (
    <View style={styles.progressCard}>
      <View style={styles.progressHeader}>
        <Text style={styles.progressHeading}>Your delivery journey</Text>
        <Text style={styles.progressNow}>{currentIndex >= 0 ? shortStatus(progressStatuses[currentIndex]) : "Starting"}</Text>
      </View>
      <View style={styles.progressTrack}>
        {progressStatuses.map((item, index) => {
          const complete = index <= currentIndex;
          const current = index === currentIndex;
          return (
            <View key={item} style={styles.progressStep}>
              <View style={styles.progressVisual}>
                <View style={[styles.progressCircle, complete && styles.progressCircleComplete, current && styles.progressCircleCurrent]}>
                  {complete ? <MaterialCommunityIcons name={current ? statusIcon(item) : "check"} size={current ? 10 : 11} color="#FFFFFF" /> : null}
                </View>
                {index < progressStatuses.length - 1 ? <View style={[styles.progressLine, index < currentIndex && styles.progressLineComplete]} /> : null}
              </View>
              <Text numberOfLines={1} style={[styles.progressStepText, current && styles.progressStepTextCurrent]}>{shortStatus(item)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function RouteRow({ icon, label, value, brand = false }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string; brand?: boolean }) {
  return <View style={styles.routeRow}><View style={[styles.routeIcon, brand && styles.routeIconBrand]}><MaterialCommunityIcons name={icon} size={20} color={brand ? v2Theme.colors.brandStrong : v2Theme.colors.ink} /></View><View style={styles.routeCopy}><Text style={styles.routeLabel}>{label}</Text><Text numberOfLines={2} style={styles.routeValue}>{value}</Text></View></View>;
}

function DetailCard({ icon, label, value }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string }) {
  return <View style={styles.detailCard}><MaterialCommunityIcons name={icon} size={21} color={v2Theme.colors.inkSecondary} /><Text style={styles.detailLabel}>{label}</Text><Text numberOfLines={2} style={styles.detailValue}>{value}</Text></View>;
}

function CommercialFact({ icon, label, value }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string }) {
  return <View style={styles.commercialFact}><MaterialCommunityIcons name={icon} size={19} color="rgba(255,255,255,0.7)" /><Text style={styles.commercialFactLabel}>{label}</Text><Text style={styles.commercialFactValue}>{value}</Text></View>;
}

function formatPackageType(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");
}

function statusIcon(status: CourierStatus): keyof typeof MaterialCommunityIcons.glyphMap {
  if (status === "REQUESTED" || status === "MATCHING") return "radar";
  if (status === "ASSIGNED") return "account-check-outline";
  if (status === "COURIER_TO_PICKUP") return "motorbike";
  if (status === "PICKED_UP") return "package-variant-closed-check";
  if (status === "IN_TRANSIT") return "navigation-variant";
  if (status === "ARRIVING") return "map-marker-radius-outline";
  if (status === "DELIVERED") return "check-decagram-outline";
  if (status === "CANCELLED") return "close-circle-outline";
  return "alert-circle-outline";
}

function humanStatus(status: CourierStatus) {
  if (status === "REQUESTED" || status === "MATCHING") return "Finding courier";
  if (status === "ASSIGNED") return "Courier assigned";
  if (status === "COURIER_TO_PICKUP") return "Heading to pickup";
  if (status === "PICKED_UP") return "Package collected";
  if (status === "IN_TRANSIT") return "On the way";
  if (status === "ARRIVING") return "Almost there";
  if (status === "DELIVERED") return "Delivered";
  if (status === "CANCELLED") return "Cancelled";
  return "Needs attention";
}

function shortStatus(status: CourierStatus) {
  if (status === "MATCHING") return "Matching";
  if (status === "ASSIGNED") return "Assigned";
  if (status === "COURIER_TO_PICKUP") return "Pickup";
  if (status === "PICKED_UP") return "Collected";
  if (status === "IN_TRANSIT") return "On way";
  if (status === "ARRIVING") return "Arriving";
  if (status === "DELIVERED") return "Done";
  return status;
}

function headline(status: CourierStatus) {
  if (status === "REQUESTED" || status === "MATCHING") return "We’re finding your courier…";
  if (status === "ASSIGNED") return "Great — your courier is confirmed.";
  if (status === "COURIER_TO_PICKUP") return "Your courier is heading over.";
  if (status === "PICKED_UP") return "Your parcel has been collected.";
  if (status === "IN_TRANSIT") return "It’s on the way.";
  if (status === "ARRIVING") return "Almost there.";
  if (status === "DELIVERED") return "Delivered 💚";
  if (status === "CANCELLED") return "Delivery cancelled.";
  return "This delivery needs attention.";
}

function statusMessage(status: CourierStatus) {
  switch (status) {
    case "REQUESTED": return "Your request is ready and entering the courier network.";
    case "MATCHING": return "Hang tight — we’re checking approved couriers near your route.";
    case "ASSIGNED": return "The courier accepted your delivery and is getting ready for pickup.";
    case "COURIER_TO_PICKUP": return "You can follow the courier as they head to the collection point.";
    case "PICKED_UP": return "Collection is confirmed. The next leg is delivery to your recipient.";
    case "IN_TRANSIT": return "Your package is moving toward the drop-off point now.";
    case "ARRIVING": return "Your courier is close. Make sure the recipient is ready for handoff.";
    case "DELIVERED": return "The handoff is complete and this delivery is safely closed.";
    case "CANCELLED": return "This request was stopped and is no longer available to couriers.";
    case "FAILED": return "Something interrupted the delivery. Support can help from here.";
  }
}

function courierMessage(status: CourierStatus) {
  if (status === "ASSIGNED") return "Accepted your delivery · getting ready for pickup";
  if (status === "COURIER_TO_PICKUP") return "Heading to your pickup point";
  if (status === "PICKED_UP") return "Your package is with the courier";
  if (status === "IN_TRANSIT") return "Delivering to the recipient";
  if (status === "ARRIVING") return "Approaching the drop-off";
  if (status === "DELIVERED") return "Handoff completed";
  return "Assigned to this delivery";
}

function trackingMessage(status: CourierStatus) {
  if (status === "MATCHING" || status === "REQUESTED") return "Live tracking begins after assignment";
  if (status === "DELIVERED") return "Live tracking finished";
  if (status === "CANCELLED" || status === "FAILED") return "Tracking is closed";
  return "Waiting for the courier’s next GPS point";
}

function formatEvent(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const styles = StyleSheet.create({
  hero: { borderRadius: 30, padding: 18, gap: 14, shadowColor: "#113D28", shadowOpacity: 0.17, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  statusPill: { borderRadius: 999, backgroundColor: "rgba(255,255,255,0.13)", paddingHorizontal: 10, paddingVertical: 7, flexDirection: "row", alignItems: "center", gap: 6 },
  statusPillTerminal: { backgroundColor: "rgba(255,255,255,0.1)" },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#B8F0C9" },
  statusDotTerminal: { backgroundColor: "#FFFFFF" },
  statusText: { color: "#FFFFFF", fontSize: 9, fontWeight: "900", letterSpacing: 0.3 },
  reference: { color: "rgba(255,255,255,0.56)", fontSize: 9, fontWeight: "900", letterSpacing: 0.7 },
  heroMain: { flexDirection: "row", alignItems: "center", gap: 13 },
  heroStatusIcon: { width: 54, height: 54, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.13)", alignItems: "center", justifyContent: "center" },
  heroCopy: { flex: 1, gap: 5 },
  title: { color: "#FFFFFF", fontSize: 25, lineHeight: 29, fontWeight: "900", letterSpacing: -0.7 },
  body: { color: "rgba(255,255,255,0.74)", fontSize: 11, lineHeight: 17 },
  searchCard: { minHeight: 126, borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.brandSofter, padding: 14, flexDirection: "row", alignItems: "center", gap: 13, overflow: "hidden" },
  radarStage: { width: 90, height: 90, alignItems: "center", justifyContent: "center" },
  radarRing: { position: "absolute", width: 72, height: 72, borderRadius: 36, borderWidth: 2, borderColor: v2Theme.colors.brand },
  radarCore: { width: 44, height: 44, borderRadius: 22, backgroundColor: v2Theme.colors.brand, alignItems: "center", justifyContent: "center", zIndex: 2 },
  courierDot: { position: "absolute", width: 28, height: 28, borderRadius: 14, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 8, elevation: 2 },
  courierDotOne: { top: 2, right: 2 },
  courierDotTwo: { left: 0, bottom: 4 },
  courierDotThree: { right: 0, bottom: 1 },
  searchCopy: { flex: 1, gap: 5 },
  searchTitle: { color: v2Theme.colors.ink, fontSize: 14, fontWeight: "900" },
  searchBody: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14 },
  searchDots: { flexDirection: "row", gap: 3, alignSelf: "flex-end", paddingBottom: 3 },
  searchDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: v2Theme.colors.brand },
  searchDotSoft: { opacity: 0.55 },
  searchDotSofter: { opacity: 0.25 },
  commercialCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.ink, padding: 16, flexDirection: "row", alignItems: "center", gap: 14 },
  priceBlock: { minWidth: 115 },
  commercialEyebrow: { color: "rgba(255,255,255,0.48)", fontSize: 7, fontWeight: "900", letterSpacing: 0.9 },
  price: { color: "#FFFFFF", fontSize: 31, lineHeight: 36, fontWeight: "900", letterSpacing: -1 },
  currency: { color: "rgba(255,255,255,0.44)", fontSize: 8, fontWeight: "800" },
  commercialFacts: { flex: 1, flexDirection: "row", gap: 8 },
  commercialFact: { flex: 1, minHeight: 68, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.08)", padding: 9, justifyContent: "center", gap: 3 },
  commercialFactLabel: { color: "rgba(255,255,255,0.46)", fontSize: 7, fontWeight: "800" },
  commercialFactValue: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  progressCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, padding: 14, gap: 12 },
  progressHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  progressHeading: { color: v2Theme.colors.ink, fontSize: 13, fontWeight: "900" },
  progressNow: { color: v2Theme.colors.brandStrong, fontSize: 9, fontWeight: "900" },
  progressTrack: { flexDirection: "row" },
  progressStep: { flex: 1, alignItems: "center", gap: 6 },
  progressVisual: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center" },
  progressCircle: { width: 19, height: 19, borderRadius: 10, backgroundColor: v2Theme.colors.surfaceMuted, borderWidth: 1, borderColor: v2Theme.colors.lineStrong, alignItems: "center", justifyContent: "center", zIndex: 1 },
  progressCircleComplete: { backgroundColor: v2Theme.colors.brand, borderColor: v2Theme.colors.brand },
  progressCircleCurrent: { borderWidth: 3, borderColor: "#A7E1B9", transform: [{ scale: 1.12 }] },
  progressLine: { position: "absolute", left: "50%", right: "-50%", height: 2, backgroundColor: v2Theme.colors.lineStrong },
  progressLineComplete: { backgroundColor: v2Theme.colors.brand },
  progressStepText: { color: v2Theme.colors.inkTertiary, fontSize: 7, fontWeight: "800", textAlign: "center" },
  progressStepTextCurrent: { color: v2Theme.colors.ink, fontWeight: "900" },
  routeCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, overflow: "hidden" },
  routeRow: { minHeight: 78, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", gap: 12 },
  routeIcon: { width: 42, height: 42, borderRadius: 15, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  routeIconBrand: { backgroundColor: v2Theme.colors.brandSoft },
  routeCopy: { flex: 1, gap: 3 },
  routeLabel: { color: v2Theme.colors.inkSecondary, fontSize: 9, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.55 },
  routeValue: { color: v2Theme.colors.ink, fontSize: 13, lineHeight: 18, fontWeight: "900" },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: v2Theme.colors.line, marginLeft: 69 },
  section: { gap: 10 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: v2Theme.colors.ink, fontSize: 20, fontWeight: "900", letterSpacing: -0.4 },
  courierCard: { minHeight: 84, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.brandSofter, padding: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  courierCardAssigned: { backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong },
  courierAvatar: { width: 50, height: 50, borderRadius: 18, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" },
  courierAvatarAssigned: { backgroundColor: v2Theme.colors.brand },
  courierCopy: { flex: 1, gap: 3 },
  courierTitle: { color: v2Theme.colors.ink, fontSize: 13, fontWeight: "900" },
  courierBody: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14 },
  trackingCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.brandSofter, padding: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  trackingIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  trackingIconActive: { backgroundColor: v2Theme.colors.brand },
  trackingTitle: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900" },
  liveIndicator: { minHeight: 29, borderRadius: 999, backgroundColor: v2Theme.colors.surface, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 5 },
  liveIndicatorActive: { backgroundColor: v2Theme.colors.brandSoft },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: v2Theme.colors.inkTertiary },
  liveDotActive: { backgroundColor: v2Theme.colors.brand },
  liveText: { color: v2Theme.colors.inkSecondary, fontSize: 7, fontWeight: "900" },
  liveTextActive: { color: v2Theme.colors.brandStrong },
  detailsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  detailCard: { width: "48%", minHeight: 104, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surfaceMuted, padding: 13, gap: 6 },
  detailLabel: { color: v2Theme.colors.inkSecondary, fontSize: 9, fontWeight: "800" },
  detailValue: { color: v2Theme.colors.ink, fontSize: 12, lineHeight: 17, fontWeight: "900", textTransform: "capitalize" },
  eventCount: { color: v2Theme.colors.inkTertiary, fontSize: 9, fontWeight: "800" },
  eventCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, paddingHorizontal: 13, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line },
  eventRow: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 10 },
  eventBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: v2Theme.colors.line },
  eventDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: v2Theme.colors.brand },
  eventCopy: { flex: 1, gap: 3 },
  eventTitle: { color: v2Theme.colors.ink, fontSize: 10, fontWeight: "900" },
  eventTime: { color: v2Theme.colors.inkTertiary, fontSize: 8, fontWeight: "700" },
  stateCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surfaceMuted, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  loadingIcon: { width: 42, height: 42, borderRadius: 15, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" },
  stateCopy: { flex: 1, gap: 4 },
  stateTitle: { color: v2Theme.colors.ink, fontSize: 13, fontWeight: "900" },
  stateBody: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14 },
  errorCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.dangerSoft, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  errorTitle: { color: v2Theme.colors.danger, fontSize: 12, fontWeight: "900" },
  retry: { color: v2Theme.colors.danger, fontSize: 10, fontWeight: "900" },
  cancelButton: { minHeight: 54, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.dangerSoft, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  cancelText: { color: v2Theme.colors.danger, fontSize: 11, fontWeight: "900" },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.72 },
});
