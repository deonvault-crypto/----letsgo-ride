import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";

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
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, [load]);

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
          <View style={styles.hero}>
            <View style={styles.statusRow}>
              <StatusPill status={delivery.status} />
              <Text style={styles.reference}>#{delivery.id.slice(0, 8).toUpperCase()}</Text>
            </View>
            <Text style={styles.title}>{headline(delivery.status)}</Text>
            <Text style={styles.body}>{statusMessage(delivery.status)}</Text>
          </View>

          {delivery.price_usd != null ? (
            <View style={styles.commercialCard}>
              <View style={styles.priceBlock}>
                <Text style={styles.commercialEyebrow}>DELIVERY PRICE</Text>
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
            <View style={[styles.courierCard, delivery.courier_user_id ? styles.courierCardAssigned : null]}>
              <View style={[styles.courierAvatar, delivery.courier_user_id ? styles.courierAvatarAssigned : null]}>
                <MaterialCommunityIcons name={delivery.courier_user_id ? "motorbike" : "radar"} size={26} color={delivery.courier_user_id ? "#FFFFFF" : v2Theme.colors.brandStrong} />
              </View>
              <View style={styles.courierCopy}>
                <Text style={styles.courierTitle}>{delivery.courier_name || "Finding your courier"}</Text>
                <Text style={styles.courierBody}>{delivery.courier_user_id ? courierMessage(delivery.status) : "Only approved online couriers can claim this priced request."}</Text>
              </View>
              {delivery.courier_user_id ? <MaterialCommunityIcons name="check-decagram" size={21} color={v2Theme.colors.brandStrong} /> : null}
            </View>
          </View>

          <View style={styles.trackingCard}>
            <View style={[styles.trackingIcon, tracking?.live_tracking_active && styles.trackingIconActive]}>
              <MaterialCommunityIcons name={tracking?.live_tracking_active ? "crosshairs-gps" : "map-marker-off-outline"} size={24} color={tracking?.live_tracking_active ? "#FFFFFF" : v2Theme.colors.inkSecondary} />
            </View>
            <View style={styles.stateCopy}>
              <Text style={styles.trackingTitle}>{tracking?.live_tracking_active ? "Live courier location" : trackingMessage(delivery.status)}</Text>
              <Text style={styles.stateBody}>{tracking?.live_tracking_active ? "The map refreshes from courier GPS while the active delivery is in progress." : "Location is shown only during the active courier workflow."}</Text>
            </View>
            <View style={[styles.liveIndicator, tracking?.live_tracking_active && styles.liveIndicatorActive]}><View style={[styles.liveDot, tracking?.live_tracking_active && styles.liveDotActive]} /><Text style={[styles.liveText, tracking?.live_tracking_active && styles.liveTextActive]}>{tracking?.live_tracking_active ? "LIVE" : "OFF"}</Text></View>
          </View>

          <View style={styles.detailsGrid}>
            <DetailCard icon="package-variant-closed" label="Package" value={formatPackageType(delivery.package_type)} />
            <DetailCard icon="account-outline" label="Recipient" value={delivery.recipient_name} />
            <DetailCard icon="phone-outline" label="Recipient phone" value={delivery.recipient_phone} />
            <DetailCard icon="shield-check-outline" label="Status" value={delivery.status.replaceAll("_", " ").toLowerCase()} />
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

function LoadingState() {
  return <View style={styles.stateCard}><View style={styles.loadingIcon}><MaterialCommunityIcons name="package-variant-closed" size={23} color={v2Theme.colors.brandStrong} /></View><View style={styles.stateCopy}><Text style={styles.stateTitle}>Loading delivery…</Text><Text style={styles.stateBody}>Checking courier, route and tracking state.</Text></View></View>;
}

function StatusPill({ status }: { status: CourierStatus }) {
  const terminal = status === "DELIVERED" || status === "CANCELLED" || status === "FAILED";
  return <View style={[styles.statusPill, terminal && styles.statusPillTerminal]}><View style={[styles.statusDot, terminal && styles.statusDotTerminal]} /><Text style={[styles.statusText, terminal && styles.statusTextTerminal]}>{status.replaceAll("_", " ")}</Text></View>;
}

function ProgressTimeline({ status }: { status: CourierStatus }) {
  if (status === "CANCELLED" || status === "FAILED") return null;
  const currentIndex = status === "REQUESTED" ? -1 : progressStatuses.indexOf(status);
  return (
    <View style={styles.progressCard}>
      <Text style={styles.progressHeading}>Delivery progress</Text>
      <View style={styles.progressTrack}>
        {progressStatuses.map((item, index) => {
          const complete = index <= currentIndex;
          const current = index === currentIndex;
          return (
            <View key={item} style={styles.progressStep}>
              <View style={styles.progressVisual}>
                <View style={[styles.progressCircle, complete && styles.progressCircleComplete, current && styles.progressCircleCurrent]}>{complete ? <MaterialCommunityIcons name="check" size={11} color="#FFFFFF" /> : null}</View>
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

function shortStatus(status: CourierStatus) {
  if (status === "MATCHING") return "Matching";
  if (status === "ASSIGNED") return "Assigned";
  if (status === "COURIER_TO_PICKUP") return "To pickup";
  if (status === "PICKED_UP") return "Picked up";
  if (status === "IN_TRANSIT") return "In transit";
  if (status === "ARRIVING") return "Arriving";
  if (status === "DELIVERED") return "Delivered";
  return status;
}

function headline(status: CourierStatus) {
  if (status === "REQUESTED" || status === "MATCHING") return "Finding the right courier.";
  if (status === "ASSIGNED") return "Your courier is confirmed.";
  if (status === "COURIER_TO_PICKUP") return "Courier heading to pickup.";
  if (status === "PICKED_UP") return "Package collected.";
  if (status === "IN_TRANSIT") return "Your package is moving.";
  if (status === "ARRIVING") return "Almost there.";
  if (status === "DELIVERED") return "Delivered.";
  if (status === "CANCELLED") return "Delivery cancelled.";
  return "Delivery needs attention.";
}

function statusMessage(status: CourierStatus) {
  switch (status) {
    case "REQUESTED": return "Your priced request is being prepared for matching.";
    case "MATCHING": return "Approved online couriers can now see and claim this delivery.";
    case "ASSIGNED": return "The courier has accepted your delivery and can start toward pickup.";
    case "COURIER_TO_PICKUP": return "Your courier is heading to the pickup location.";
    case "PICKED_UP": return "The courier confirmed collection of your package.";
    case "IN_TRANSIT": return "Your package is on the delivery leg to the recipient.";
    case "ARRIVING": return "The courier is close to the drop-off point.";
    case "DELIVERED": return "The courier marked the handoff as complete.";
    case "CANCELLED": return "This request has been stopped and will not be matched.";
    case "FAILED": return "This delivery needs support or operations attention.";
  }
}

function courierMessage(status: CourierStatus) {
  if (status === "ASSIGNED") return "Accepted your request · preparing for pickup";
  if (status === "COURIER_TO_PICKUP") return "Heading to the pickup location";
  if (status === "PICKED_UP") return "Package collected";
  if (status === "IN_TRANSIT") return "Delivering to the recipient";
  if (status === "ARRIVING") return "Approaching drop-off";
  if (status === "DELIVERED") return "Delivery completed";
  return "Assigned to this delivery";
}

function trackingMessage(status: CourierStatus) {
  if (status === "MATCHING" || status === "REQUESTED") return "Tracking starts after assignment";
  if (status === "DELIVERED") return "Live tracking finished";
  if (status === "CANCELLED" || status === "FAILED") return "Tracking is closed";
  return "Waiting for courier GPS";
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
  hero: { gap: 8 },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  statusPill: { borderRadius: v2Theme.radius.pill, backgroundColor: v2Theme.colors.brandSoft, paddingHorizontal: 10, paddingVertical: 7, flexDirection: "row", alignItems: "center", gap: 6 },
  statusPillTerminal: { backgroundColor: v2Theme.colors.surfaceMuted },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: v2Theme.colors.brand },
  statusDotTerminal: { backgroundColor: v2Theme.colors.inkTertiary },
  statusText: { color: v2Theme.colors.brandStrong, fontSize: 9, fontWeight: "900", textTransform: "capitalize", letterSpacing: 0.3 },
  statusTextTerminal: { color: v2Theme.colors.inkSecondary },
  reference: { color: v2Theme.colors.inkTertiary, fontSize: 9, fontWeight: "900", letterSpacing: 0.7 },
  title: { color: v2Theme.colors.ink, fontSize: 29, lineHeight: 34, fontWeight: "900", letterSpacing: -0.9 },
  body: { color: v2Theme.colors.inkSecondary, fontSize: 13, lineHeight: 20 },

  commercialCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.ink, padding: 16, flexDirection: "row", alignItems: "center", gap: 14 },
  priceBlock: { minWidth: 115 },
  commercialEyebrow: { color: "rgba(255,255,255,0.48)", fontSize: 7, fontWeight: "900", letterSpacing: 0.9 },
  price: { color: "#FFFFFF", fontSize: 31, lineHeight: 36, fontWeight: "900", letterSpacing: -1 },
  currency: { color: "rgba(255,255,255,0.44)", fontSize: 8, fontWeight: "800" },
  commercialFacts: { flex: 1, flexDirection: "row", gap: 8 },
  commercialFact: { flex: 1, minHeight: 68, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.08)", padding: 9, justifyContent: "center", gap: 3 },
  commercialFactLabel: { color: "rgba(255,255,255,0.46)", fontSize: 7, fontWeight: "800" },
  commercialFactValue: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },

  progressCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 14, gap: 12 },
  progressHeading: { color: v2Theme.colors.ink, fontSize: 13, fontWeight: "900" },
  progressTrack: { flexDirection: "row" },
  progressStep: { flex: 1, alignItems: "center", gap: 6 },
  progressVisual: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center" },
  progressCircle: { width: 17, height: 17, borderRadius: 9, backgroundColor: v2Theme.colors.surfaceMuted, borderWidth: 1, borderColor: v2Theme.colors.lineStrong, alignItems: "center", justifyContent: "center", zIndex: 1 },
  progressCircleComplete: { backgroundColor: v2Theme.colors.brand, borderColor: v2Theme.colors.brand },
  progressCircleCurrent: { borderWidth: 3, borderColor: v2Theme.colors.brandSoft },
  progressLine: { position: "absolute", left: "50%", right: "-50%", height: 2, backgroundColor: v2Theme.colors.lineStrong },
  progressLineComplete: { backgroundColor: v2Theme.colors.brand },
  progressStepText: { color: v2Theme.colors.inkTertiary, fontSize: 7, fontWeight: "800", textAlign: "center" },
  progressStepTextCurrent: { color: v2Theme.colors.ink, fontWeight: "900" },

  routeCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, overflow: "hidden" },
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
  courierCardAssigned: { backgroundColor: v2Theme.colors.surface },
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
  eventCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, paddingHorizontal: 13 },
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
