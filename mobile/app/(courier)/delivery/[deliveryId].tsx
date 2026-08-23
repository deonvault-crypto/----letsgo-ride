import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { DeliveryMap } from "../../../components/maps/DeliveryMap";
import { Screen } from "../../../components/ui/Screen";
import { v2Theme } from "../../../constants/v2Theme";
import {
  getCourierDelivery,
  getCourierEvents,
  updateCourierDeliveryStatus,
  updateCourierLocation,
} from "../../../services/courierService";
import { watchForegroundLocation } from "../../../services/locationService";
import { CourierDelivery, CourierEvent, CourierStatus } from "../../../types/courier.types";
import { openNavigation } from "../../../utils/openNavigation";

const NEXT_STATUS: Partial<Record<CourierStatus, CourierStatus>> = {
  ASSIGNED: "COURIER_TO_PICKUP",
  COURIER_TO_PICKUP: "PICKED_UP",
  PICKED_UP: "IN_TRANSIT",
  IN_TRANSIT: "ARRIVING",
  ARRIVING: "DELIVERED",
};

const TRACKING_STATUSES = new Set<CourierStatus>(["ASSIGNED", "COURIER_TO_PICKUP", "PICKED_UP", "IN_TRANSIT", "ARRIVING"]);
const PICKUP_NAV_STATUSES = new Set<CourierStatus>(["ASSIGNED", "COURIER_TO_PICKUP"]);
const DROPOFF_NAV_STATUSES = new Set<CourierStatus>(["PICKED_UP", "IN_TRANSIT", "ARRIVING"]);

export default function CourierJobScreen() {
  const { deliveryId } = useLocalSearchParams<{ deliveryId: string }>();
  const [delivery, setDelivery] = useState<CourierDelivery | null>(null);
  const [events, setEvents] = useState<CourierEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locationSubscription = useRef<{ remove: () => void } | null>(null);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load this delivery job.");
    } finally {
      setLoading(false);
    }
  }, [deliveryId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 12000);
    return () => {
      clearInterval(timer);
      locationSubscription.current?.remove();
      locationSubscription.current = null;
    };
  }, [load]);

  const stopSharing = useCallback(() => {
    locationSubscription.current?.remove();
    locationSubscription.current = null;
    setSharing(false);
  }, []);

  const startSharing = useCallback(async (activeDelivery: CourierDelivery) => {
    if (locationSubscription.current || !TRACKING_STATUSES.has(activeDelivery.status)) return;
    try {
      setError(null);
      const subscription = await watchForegroundLocation(
        (location) => {
          setDelivery((current) => current ? { ...current, last_courier_location: location } : current);
          updateCourierLocation(activeDelivery.id, {
            latitude: location.latitude,
            longitude: location.longitude,
            accuracy: location.accuracy,
            heading: location.heading,
            speed: location.speed,
            recorded_at: new Date(location.timestamp).toISOString(),
          }).catch((err) => setError(err instanceof Error ? err.message : "Unable to share courier location."));
        },
        (err) => setError(err.message),
      );
      locationSubscription.current = subscription;
      setSharing(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start live location.");
      setSharing(false);
    }
  }, []);

  useEffect(() => {
    if (!delivery) return;
    if (!TRACKING_STATUSES.has(delivery.status)) {
      stopSharing();
      return;
    }
    if (!locationSubscription.current) startSharing(delivery);
  }, [delivery?.id, delivery?.status, startSharing, stopSharing]);

  async function navigate() {
    if (!delivery || navigating) return;
    const destination = PICKUP_NAV_STATUSES.has(delivery.status)
      ? delivery.pickup_address
      : DROPOFF_NAV_STATUSES.has(delivery.status)
        ? delivery.dropoff_address
        : null;
    if (!destination) return;
    try {
      setNavigating(true);
      setError(null);
      await openNavigation(destination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to open navigation.");
    } finally {
      setNavigating(false);
    }
  }

  async function advance() {
    if (!delivery || busy) return;
    const next = NEXT_STATUS[delivery.status];
    if (!next) return;
    try {
      setBusy(true);
      setError(null);
      const updated = await updateCourierDeliveryStatus(delivery.id, next);
      setDelivery(updated);
      setEvents(await getCourierEvents(delivery.id));
      if (next === "DELIVERED") stopSharing();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update delivery progress.");
    } finally {
      setBusy(false);
    }
  }

  const next = delivery ? NEXT_STATUS[delivery.status] : undefined;
  const navigationLabel = delivery
    ? PICKUP_NAV_STATUSES.has(delivery.status)
      ? "Navigate to pickup"
      : DROPOFF_NAV_STATUSES.has(delivery.status)
        ? "Navigate to drop-off"
        : null
    : null;

  return (
    <Screen showBack fallbackRoute="/(courier)/home" title="Delivery job" showNotifications={false}>
      {loading ? <Text style={styles.loading}>Loading delivery job…</Text> : null}
      {error ? <Pressable accessibilityRole="button" onPress={load} style={styles.errorCard}><MaterialCommunityIcons name="alert-circle-outline" size={21} color={v2Theme.colors.danger} /><Text style={styles.errorText}>{error}</Text><Text style={styles.retry}>Retry</Text></Pressable> : null}

      {delivery ? (
        <>
          <View style={styles.heroCard}>
            <View style={styles.heroTop}>
              <View style={styles.heroIcon}><MaterialCommunityIcons name={delivery.source_type === "FOOD_ORDER" ? "food-fork-drink" : "package-variant-closed"} size={26} color={v2Theme.colors.brandStrong} /></View>
              <View style={styles.heroCopy}><Text style={styles.heroEyebrow}>{delivery.source_type === "FOOD_ORDER" ? "FOOD DELIVERY" : "COURIER DELIVERY"} · {delivery.id.slice(0, 8).toUpperCase()}</Text><Text style={styles.heroTitle}>{delivery.status.replaceAll("_", " ")}</Text></View>
              {delivery.courier_payout_usd != null ? <View style={styles.payoutBadge}><Text style={styles.payoutLabel}>YOUR PAY</Text><Text style={styles.payoutValue}>${delivery.courier_payout_usd.toFixed(2)}</Text></View> : null}
            </View>
            <Text style={styles.heroRoute}>{delivery.pickup_address} → {delivery.dropoff_address}</Text>
            <View style={styles.heroMeta}>
              {delivery.distance_km != null ? <Meta value={`${delivery.distance_km.toFixed(1)} km`} /> : null}
              {delivery.estimated_duration_minutes != null ? <Meta value={`${delivery.estimated_duration_minutes} min route`} /> : null}
              <Meta value={delivery.package_type.replaceAll("_", " ")} />
            </View>
          </View>

          <DeliveryMap pickup={delivery.pickup_location} dropoff={delivery.dropoff_location} courier={delivery.last_courier_location} height={300} />

          {navigationLabel ? (
            <Pressable accessibilityRole="button" onPress={navigate} disabled={navigating} style={({ pressed }) => [styles.navigationButton, navigating && styles.disabled, pressed && !navigating && styles.pressed]}>
              <View style={styles.navigationIcon}><MaterialCommunityIcons name="navigation-variant" size={24} color="#FFFFFF" /></View>
              <View style={styles.navigationCopy}><Text style={styles.navigationTitle}>{navigating ? "Opening maps…" : navigationLabel}</Text><Text style={styles.navigationBody}>{PICKUP_NAV_STATUSES.has(delivery.status) ? delivery.pickup_address : delivery.dropoff_address}</Text></View>
              <MaterialCommunityIcons name="arrow-top-right" size={21} color="#FFFFFF" />
            </Pressable>
          ) : null}

          {TRACKING_STATUSES.has(delivery.status) ? (
            <View style={styles.trackingCard}>
              <View style={[styles.trackingIcon, sharing && styles.trackingIconActive]}><MaterialCommunityIcons name={sharing ? "crosshairs-gps" : "map-marker-alert-outline"} size={24} color={sharing ? "#FFFFFF" : v2Theme.colors.brandStrong} /></View>
              <View style={styles.trackingCopy}><Text style={styles.trackingTitle}>{sharing ? "Live location is sharing automatically" : "Starting live location…"}</Text><Text style={styles.trackingBody}>{sharing ? "It stays on continuously through pickup, transit and arrival while this job is active." : "LetsGoRide is requesting foreground GPS so the customer can follow the active delivery."}</Text></View>
              <View style={[styles.trackingState, sharing && styles.trackingStateActive]}><View style={[styles.trackingStateDot, sharing && styles.trackingStateDotActive]} /><Text style={[styles.trackingStateText, sharing && styles.trackingStateTextActive]}>{sharing ? "LIVE" : "AUTO"}</Text></View>
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Job details</Text>
            <View style={styles.detailCard}>
              <DetailRow icon="circle-slice-8" title="Pickup" body={delivery.pickup_address} />
              <DetailRow icon="map-marker-outline" title="Drop-off" body={delivery.dropoff_address} />
              <DetailRow icon="account-outline" title="Recipient" body={delivery.recipient_name} />
              <DetailRow icon="phone-outline" title="Recipient phone" body={delivery.recipient_phone} />
              {delivery.package_description ? <DetailRow icon="package-variant" title="Package" body={delivery.package_description} /> : null}
              {delivery.pickup_note ? <DetailRow icon="note-text-outline" title="Pickup note" body={delivery.pickup_note} /> : null}
              {delivery.dropoff_note ? <DetailRow icon="note-text-outline" title="Drop-off note" body={delivery.dropoff_note} /> : null}
            </View>
          </View>

          {next ? (
            <Pressable accessibilityRole="button" accessibilityLabel={nextLabel(next)} onPress={advance} disabled={busy} style={({ pressed }) => [styles.primaryButton, busy && styles.disabled, pressed && !busy && styles.pressed]}>
              <View><Text style={styles.primaryText}>{busy ? "Updating…" : nextLabel(next)}</Text><Text style={styles.primarySub}>{nextHelp(next)}</Text></View>
              <MaterialCommunityIcons name="arrow-right" size={22} color="#FFFFFF" />
            </Pressable>
          ) : delivery.status === "DELIVERED" ? (
            <View style={styles.completedCard}><View style={styles.completedIcon}><MaterialCommunityIcons name="check" size={24} color="#FFFFFF" /></View><View style={styles.completedCopy}><Text style={styles.completedTitle}>Delivery complete</Text><Text style={styles.completedBody}>{delivery.courier_payout_usd != null ? `$${delivery.courier_payout_usd.toFixed(2)} is recorded in your completed courier earnings.` : "This job is recorded as delivered."}</Text></View></View>
          ) : null}

          <View style={styles.section}>
            <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Job activity</Text><Text style={styles.activityCount}>{events.length} events</Text></View>
            <View style={styles.eventCard}>
              {events.slice().reverse().slice(0, 10).map((event, index) => (
                <View key={event.id} style={[styles.eventRow, index > 0 && styles.eventBorder]}><View style={styles.eventDot} /><View style={styles.eventCopy}><Text style={styles.eventTitle}>{event.type.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())}</Text><Text style={styles.eventTime}>{formatTime(event.created_at)}</Text></View></View>
              ))}
            </View>
          </View>
        </>
      ) : null}
    </Screen>
  );
}

function Meta({ value }: { value: string }) {
  return <View style={styles.metaPill}><Text style={styles.heroMetaText}>{value}</Text></View>;
}

function DetailRow({ icon, title, body }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; body: string }) {
  return <View style={styles.detailRow}><View style={styles.detailIcon}><MaterialCommunityIcons name={icon} size={20} color={v2Theme.colors.inkSecondary} /></View><View style={styles.detailCopy}><Text style={styles.detailTitle}>{title}</Text><Text style={styles.detailBody}>{body}</Text></View></View>;
}

function nextLabel(status: CourierStatus) {
  if (status === "COURIER_TO_PICKUP") return "Head to pickup";
  if (status === "PICKED_UP") return "Confirm pickup";
  if (status === "IN_TRANSIT") return "Start delivery";
  if (status === "ARRIVING") return "Mark arriving";
  if (status === "DELIVERED") return "Complete delivery";
  return status.replaceAll("_", " ");
}

function nextHelp(status: CourierStatus) {
  if (status === "COURIER_TO_PICKUP") return "Begin the pickup leg · GPS stays live automatically";
  if (status === "PICKED_UP") return "Only confirm after the package is physically collected";
  if (status === "IN_TRANSIT") return "Begin the delivery leg · live tracking continues";
  if (status === "ARRIVING") return "Use when you are close to the drop-off";
  if (status === "DELIVERED") return "Finish after successful handover · tracking stops automatically";
  return "Update delivery progress";
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const styles = StyleSheet.create({
  loading: { color: v2Theme.colors.inkSecondary, fontSize: 11 },
  errorCard: { minHeight: 58, borderRadius: v2Theme.radius.lg, backgroundColor: v2Theme.colors.dangerSoft, padding: 12, flexDirection: "row", alignItems: "center", gap: 9 },
  errorText: { flex: 1, color: v2Theme.colors.danger, fontSize: 10, fontWeight: "700" },
  retry: { color: v2Theme.colors.danger, fontSize: 10, fontWeight: "900" },
  heroCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.ink, padding: 16, gap: 12 },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  heroIcon: { width: 49, height: 49, borderRadius: 17, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  heroCopy: { flex: 1, gap: 3 },
  heroEyebrow: { color: "rgba(255,255,255,0.48)", fontSize: 7, fontWeight: "900", letterSpacing: 0.7 },
  heroTitle: { color: "#FFFFFF", fontSize: 17, fontWeight: "900", textTransform: "capitalize" },
  payoutBadge: { alignItems: "flex-end", gap: 2 },
  payoutLabel: { color: "rgba(255,255,255,0.46)", fontSize: 7, fontWeight: "900" },
  payoutValue: { color: "#FFFFFF", fontSize: 18, fontWeight: "900" },
  heroRoute: { color: "rgba(255,255,255,0.9)", fontSize: 12, lineHeight: 18, fontWeight: "800" },
  heroMeta: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  metaPill: { minHeight: 27, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)", paddingHorizontal: 8, justifyContent: "center" },
  heroMetaText: { color: "rgba(255,255,255,0.58)", fontSize: 8, fontWeight: "800", textTransform: "capitalize" },
  navigationButton: { minHeight: 72, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.brand, padding: 12, flexDirection: "row", alignItems: "center", gap: 11 },
  navigationIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
  navigationCopy: { flex: 1, gap: 3 },
  navigationTitle: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  navigationBody: { color: "rgba(255,255,255,0.72)", fontSize: 9, lineHeight: 13 },
  trackingCard: { minHeight: 84, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.brandSofter, padding: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  trackingIcon: { width: 48, height: 48, borderRadius: 17, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" },
  trackingIconActive: { backgroundColor: v2Theme.colors.brand },
  trackingCopy: { flex: 1, gap: 3 },
  trackingTitle: { color: v2Theme.colors.ink, fontSize: 11, fontWeight: "900" },
  trackingBody: { color: v2Theme.colors.inkSecondary, fontSize: 8, lineHeight: 13 },
  trackingState: { minHeight: 34, borderRadius: 999, backgroundColor: v2Theme.colors.surface, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", gap: 5 },
  trackingStateActive: { backgroundColor: v2Theme.colors.brandSoft },
  trackingStateDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: v2Theme.colors.inkTertiary },
  trackingStateDotActive: { backgroundColor: v2Theme.colors.brand },
  trackingStateText: { color: v2Theme.colors.inkSecondary, fontSize: 7, fontWeight: "900" },
  trackingStateTextActive: { color: v2Theme.colors.brandStrong },
  section: { gap: 10 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: v2Theme.colors.ink, fontSize: 20, fontWeight: "900", letterSpacing: -0.4 },
  activityCount: { color: v2Theme.colors.inkTertiary, fontSize: 8, fontWeight: "800" },
  detailCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, overflow: "hidden" },
  detailRow: { minHeight: 68, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: v2Theme.colors.line },
  detailIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  detailCopy: { flex: 1, gap: 3 },
  detailTitle: { color: v2Theme.colors.inkSecondary, fontSize: 8, fontWeight: "800" },
  detailBody: { color: v2Theme.colors.ink, fontSize: 11, lineHeight: 16, fontWeight: "800" },
  primaryButton: { minHeight: 66, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.ink, paddingHorizontal: 17, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  primaryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  primarySub: { color: "rgba(255,255,255,0.62)", fontSize: 8, marginTop: 2, maxWidth: 270 },
  completedCard: { minHeight: 78, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.brandSofter, padding: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  completedIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: v2Theme.colors.brand, alignItems: "center", justifyContent: "center" },
  completedCopy: { flex: 1, gap: 3 },
  completedTitle: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900" },
  completedBody: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14 },
  eventCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, paddingHorizontal: 13 },
  eventRow: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 10 },
  eventBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: v2Theme.colors.line },
  eventDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: v2Theme.colors.brand },
  eventCopy: { flex: 1, gap: 3 },
  eventTitle: { color: v2Theme.colors.ink, fontSize: 10, fontWeight: "900" },
  eventTime: { color: v2Theme.colors.inkTertiary, fontSize: 8, fontWeight: "700" },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.72 },
});
