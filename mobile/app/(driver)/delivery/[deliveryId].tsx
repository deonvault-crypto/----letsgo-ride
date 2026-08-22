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

const NEXT_STATUS: Partial<Record<CourierStatus, CourierStatus>> = {
  ASSIGNED: "COURIER_TO_PICKUP",
  COURIER_TO_PICKUP: "PICKED_UP",
  PICKED_UP: "IN_TRANSIT",
  IN_TRANSIT: "ARRIVING",
  ARRIVING: "DELIVERED",
};

const TRACKING_STATUSES = new Set<CourierStatus>(["ASSIGNED", "COURIER_TO_PICKUP", "PICKED_UP", "IN_TRANSIT", "ARRIVING"]);

export default function CourierJobScreen() {
  const { deliveryId } = useLocalSearchParams<{ deliveryId: string }>();
  const [delivery, setDelivery] = useState<CourierDelivery | null>(null);
  const [events, setEvents] = useState<CourierEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
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
    return () => {
      locationSubscription.current?.remove();
      locationSubscription.current = null;
    };
  }, [load]);

  useEffect(() => {
    if (!delivery || !TRACKING_STATUSES.has(delivery.status)) stopSharing();
  }, [delivery?.status]);

  async function startSharing() {
    if (!delivery || sharing || !TRACKING_STATUSES.has(delivery.status)) return;
    try {
      setError(null);
      const subscription = await watchForegroundLocation(
        (location) => {
          setDelivery((current) => current ? { ...current, last_courier_location: location } : current);
          updateCourierLocation(delivery.id, {
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
    }
  }

  function stopSharing() {
    locationSubscription.current?.remove();
    locationSubscription.current = null;
    setSharing(false);
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

  return (
    <Screen showBack fallbackRoute="/(driver)/work" title="Delivery job" showNotifications={false}>
      {loading ? <Text style={styles.loading}>Loading delivery job…</Text> : null}
      {error ? <Pressable accessibilityRole="button" onPress={load} style={styles.errorCard}><MaterialCommunityIcons name="alert-circle-outline" size={21} color={v2Theme.colors.danger} /><Text style={styles.errorText}>{error}</Text><Text style={styles.retry}>Retry</Text></Pressable> : null}

      {delivery ? (
        <>
          <View style={styles.heroCard}>
            <View style={styles.heroTop}>
              <View style={styles.heroIcon}><MaterialCommunityIcons name="package-variant-closed" size={26} color={v2Theme.colors.brandStrong} /></View>
              <View style={styles.heroCopy}><Text style={styles.heroEyebrow}>DELIVERY {delivery.id.slice(0, 8).toUpperCase()}</Text><Text style={styles.heroTitle}>{delivery.status.replaceAll("_", " ")}</Text></View>
            </View>
            <Text style={styles.heroRoute}>{delivery.pickup_address} → {delivery.dropoff_address}</Text>
            <View style={styles.heroMeta}><Text style={styles.heroMetaText}>{delivery.package_type.replaceAll("_", " ")}</Text>{delivery.price_usd != null ? <><View style={styles.metaDot} /><Text style={styles.heroMetaText}>${delivery.price_usd.toFixed(2)}</Text></> : null}</View>
          </View>

          <DeliveryMap pickup={delivery.pickup_location} dropoff={delivery.dropoff_location} courier={delivery.last_courier_location} height={300} />

          {TRACKING_STATUSES.has(delivery.status) ? (
            <View style={styles.trackingCard}>
              <View style={[styles.trackingIcon, sharing && styles.trackingIconActive]}><MaterialCommunityIcons name="crosshairs-gps" size={24} color={sharing ? "#FFFFFF" : v2Theme.colors.brandStrong} /></View>
              <View style={styles.trackingCopy}><Text style={styles.trackingTitle}>{sharing ? "Live location sharing" : "Share live courier location"}</Text><Text style={styles.trackingBody}>{sharing ? "Customer tracking updates while this screen stays active." : "Foreground GPS only. Start it when actively working this job."}</Text></View>
              <Pressable accessibilityRole="button" onPress={sharing ? stopSharing : startSharing} style={[styles.trackingButton, sharing && styles.trackingButtonActive]}><Text style={[styles.trackingButtonText, sharing && styles.trackingButtonTextActive]}>{sharing ? "Stop" : "Start"}</Text></Pressable>
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
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Job activity</Text>
            <View style={styles.eventCard}>
              {events.slice().reverse().slice(0, 10).map((event, index) => (
                <View key={event.id} style={[styles.eventRow, index > 0 && styles.eventBorder]}>
                  <View style={styles.eventDot} />
                  <View style={styles.eventCopy}><Text style={styles.eventTitle}>{event.type.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())}</Text><Text style={styles.eventTime}>{formatTime(event.created_at)}</Text></View>
                </View>
              ))}
            </View>
          </View>
        </>
      ) : null}
    </Screen>
  );
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
  if (status === "COURIER_TO_PICKUP") return "You are on the way to collect the package";
  if (status === "PICKED_UP") return "Only confirm once the package is physically collected";
  if (status === "IN_TRANSIT") return "Begin the delivery leg to the recipient";
  if (status === "ARRIVING") return "Use when you are close to the drop-off";
  if (status === "DELIVERED") return "Finish the job after successful handover";
  return "Update delivery progress";
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const styles = StyleSheet.create({
  loading: { color: v2Theme.colors.inkSecondary, fontSize: 12 },
  errorCard: { minHeight: 58, borderRadius: v2Theme.radius.lg, backgroundColor: v2Theme.colors.dangerSoft, padding: 12, flexDirection: "row", alignItems: "center", gap: 9 },
  errorText: { flex: 1, color: v2Theme.colors.danger, fontSize: 11, fontWeight: "700" },
  retry: { color: v2Theme.colors.danger, fontSize: 11, fontWeight: "900" },
  heroCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.ink, padding: 17, gap: 12 },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 11 },
  heroIcon: { width: 50, height: 50, borderRadius: 17, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  heroCopy: { flex: 1, gap: 3 },
  heroEyebrow: { color: "rgba(255,255,255,0.58)", fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  heroTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "900", textTransform: "capitalize" },
  heroRoute: { color: "rgba(255,255,255,0.9)", fontSize: 13, lineHeight: 19, fontWeight: "800" },
  heroMeta: { flexDirection: "row", alignItems: "center", gap: 7 },
  heroMetaText: { color: "rgba(255,255,255,0.58)", fontSize: 9, fontWeight: "800", textTransform: "capitalize" },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.4)" },
  trackingCard: { minHeight: 82, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.brandSofter, padding: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  trackingIcon: { width: 48, height: 48, borderRadius: 17, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" },
  trackingIconActive: { backgroundColor: v2Theme.colors.brand },
  trackingCopy: { flex: 1, gap: 3 },
  trackingTitle: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900" },
  trackingBody: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14 },
  trackingButton: { minHeight: 38, borderRadius: 14, backgroundColor: v2Theme.colors.surface, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  trackingButtonActive: { backgroundColor: v2Theme.colors.ink },
  trackingButtonText: { color: v2Theme.colors.ink, fontSize: 10, fontWeight: "900" },
  trackingButtonTextActive: { color: "#FFFFFF" },
  section: { gap: 10 },
  sectionTitle: { color: v2Theme.colors.ink, fontSize: 20, fontWeight: "900", letterSpacing: -0.4 },
  detailCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, overflow: "hidden" },
  detailRow: { minHeight: 68, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: v2Theme.colors.line },
  detailIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  detailCopy: { flex: 1, gap: 3 },
  detailTitle: { color: v2Theme.colors.inkSecondary, fontSize: 9, fontWeight: "800" },
  detailBody: { color: v2Theme.colors.ink, fontSize: 12, lineHeight: 17, fontWeight: "800" },
  primaryButton: { minHeight: 66, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.brand, paddingHorizontal: 17, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  primaryText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  primarySub: { color: "rgba(255,255,255,0.72)", fontSize: 9, marginTop: 2, maxWidth: 270 },
  eventCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, paddingHorizontal: 13 },
  eventRow: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 10 },
  eventBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: v2Theme.colors.line },
  eventDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: v2Theme.colors.brand },
  eventCopy: { flex: 1, gap: 3 },
  eventTitle: { color: v2Theme.colors.ink, fontSize: 10, fontWeight: "900" },
  eventTime: { color: v2Theme.colors.inkSecondary, fontSize: 9 },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
});
