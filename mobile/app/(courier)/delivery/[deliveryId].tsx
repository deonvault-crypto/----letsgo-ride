import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { DeliveryMap } from "../../../components/maps/DeliveryMap";
import { Screen } from "../../../components/ui/Screen";
import { v2Theme } from "../../../constants/v2Theme";
import {
  completeCourierDeliveryWithPin,
  getCourierDelivery,
  getCourierEvents,
  reportCourierDelay,
  updateCourierDeliveryStatus,
  updateCourierLocation,
} from "../../../services/courierService";
import { watchForegroundLocation } from "../../../services/locationService";
import { CourierDelivery, CourierEvent, CourierStatus } from "../../../types/courier.types";
import { openNavigation } from "../../../utils/openNavigation";

const TRACKING_STATUSES = new Set<CourierStatus>(["ASSIGNED", "COURIER_TO_PICKUP", "PICKED_UP", "IN_TRANSIT", "ARRIVING"]);
const PICKUP_STATUSES = new Set<CourierStatus>(["ASSIGNED", "COURIER_TO_PICKUP"]);
const DROPOFF_STATUSES = new Set<CourierStatus>(["PICKED_UP", "IN_TRANSIT", "ARRIVING"]);
const HANDOFF_RADIUS_METERS = 250;

export default function CourierJobScreen() {
  const { deliveryId } = useLocalSearchParams<{ deliveryId: string }>();
  const [delivery, setDelivery] = useState<CourierDelivery | null>(null);
  const [events, setEvents] = useState<CourierEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [handoffPin, setHandoffPin] = useState("");
  const [delayNote, setDelayNote] = useState("");
  const [delayOpen, setDelayOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
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
    const timer = setInterval(load, 10000);
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
          }).then((updated) => {
            setDelivery(updated);
          }).catch((err) => {
            setError(err instanceof Error ? err.message : "Unable to share courier location.");
          });
        },
        (err) => setError(err.message),
      );
      locationSubscription.current = subscription;
      setSharing(true);
    } catch (err) {
      setSharing(false);
      setError(err instanceof Error ? err.message : "Unable to start live location.");
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
    const destination = PICKUP_STATUSES.has(delivery.status)
      ? delivery.pickup_address
      : DROPOFF_STATUSES.has(delivery.status)
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

  async function confirmPickup() {
    if (!delivery || busy || !PICKUP_STATUSES.has(delivery.status)) return;
    try {
      setBusy(true);
      setMessage(null);
      setError(null);
      const updated = await updateCourierDeliveryStatus(delivery.id, "PICKED_UP");
      setDelivery(updated);
      setEvents(await getCourierEvents(delivery.id));
      setMessage("Collected. Navigation has switched to the recipient.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to confirm pickup.");
    } finally {
      setBusy(false);
    }
  }

  async function submitDelay() {
    if (!delivery || busy) return;
    try {
      setBusy(true);
      setMessage(null);
      setError(null);
      await reportCourierDelay(delivery.id, delayNote.trim() || undefined);
      setDelayOpen(false);
      setDelayNote("");
      setEvents(await getCourierEvents(delivery.id));
      setMessage("Delay reported. Everyone following this order has been updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to report the delay.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmHandoff() {
    if (!delivery || busy || handoffPin.length !== 4 || !isHandoffUnlocked(delivery)) return;
    try {
      setBusy(true);
      setMessage(null);
      setError(null);
      const updated = await completeCourierDeliveryWithPin(delivery.id, handoffPin);
      setDelivery(updated);
      setHandoffPin("");
      setEvents(await getCourierEvents(delivery.id));
      stopSharing();
      setMessage("Code verified. Delivery completed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to complete the handoff.");
    } finally {
      setBusy(false);
    }
  }

  const navigationLabel = delivery
    ? PICKUP_STATUSES.has(delivery.status)
      ? "Navigate to pickup"
      : DROPOFF_STATUSES.has(delivery.status)
        ? "Navigate to recipient"
        : null
    : null;

  return (
    <Screen showBack fallbackRoute="/(courier)/home" title="Delivery" showNotifications={false}>
      {loading ? <CourierLoadingState /> : null}

      {error ? (
        <Pressable accessibilityRole="button" onPress={load} style={styles.errorCard}>
          <MaterialCommunityIcons name="alert-circle-outline" size={21} color={v2Theme.colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.retry}>Retry</Text>
        </Pressable>
      ) : null}

      {message ? (
        <View style={styles.messageCard}>
          <MaterialCommunityIcons name="check-circle-outline" size={20} color={v2Theme.colors.brandStrong} />
          <Text style={styles.messageText}>{message}</Text>
        </View>
      ) : null}

      {delivery ? (
        <>
          <View style={styles.heroCard}>
            <View style={styles.heroTop}>
              <View style={styles.heroIcon}>
                <MaterialCommunityIcons name={delivery.source_type === "FOOD_ORDER" ? "food-takeout-box-outline" : "package-variant-closed"} size={28} color={v2Theme.colors.brandStrong} />
              </View>
              <View style={styles.heroCopy}>
                <Text style={styles.heroEyebrow}>{delivery.source_type === "FOOD_ORDER" ? "FOOD DELIVERY" : "COURIER DELIVERY"} · {delivery.id.slice(0, 8).toUpperCase()}</Text>
                <Text style={styles.heroTitle}>{courierStatusCopy(delivery.status)}</Text>
              </View>
              {delivery.courier_payout_usd != null ? (
                <View style={styles.payoutWrap}>
                  <Text style={styles.payoutLabel}>YOUR PAY</Text>
                  <Text style={styles.payoutValue}>${delivery.courier_payout_usd.toFixed(2)}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.heroRoute}>{delivery.pickup_address} → {delivery.dropoff_address}</Text>
            <JourneyStrip status={delivery.status} />
          </View>

          <DeliveryMap pickup={delivery.pickup_location} dropoff={delivery.dropoff_location} courier={delivery.last_courier_location} height={320} />

          {navigationLabel ? (
            <Pressable accessibilityRole="button" onPress={navigate} disabled={navigating} style={({ pressed }) => [styles.navigationButton, pressed && styles.pressed]}>
              <View style={styles.navigationIcon}><MaterialCommunityIcons name="navigation-variant" size={24} color="#FFFFFF" /></View>
              <View style={styles.navigationCopy}>
                <Text style={styles.navigationTitle}>{navigating ? "Opening maps…" : navigationLabel}</Text>
                <Text numberOfLines={2} style={styles.navigationBody}>{PICKUP_STATUSES.has(delivery.status) ? delivery.pickup_address : delivery.dropoff_address}</Text>
              </View>
              <MaterialCommunityIcons name="arrow-top-right" size={21} color="#FFFFFF" />
            </Pressable>
          ) : null}

          {TRACKING_STATUSES.has(delivery.status) ? (
            <View style={styles.trackingCard}>
              <View style={[styles.trackingIcon, sharing && styles.trackingIconActive]}>
                <MaterialCommunityIcons name="crosshairs-gps" size={24} color={sharing ? "#FFFFFF" : v2Theme.colors.brandStrong} />
              </View>
              <View style={styles.trackingCopy}>
                <Text style={styles.trackingTitle}>{sharing ? "Live journey active" : "Connecting live GPS…"}</Text>
                <Text style={styles.trackingBody}>{trackingCopy(delivery.status)}</Text>
              </View>
              <View style={[styles.livePill, sharing && styles.livePillActive]}><Text style={[styles.liveText, sharing && styles.liveTextActive]}>{sharing ? "LIVE" : "AUTO"}</Text></View>
            </View>
          ) : null}

          {PICKUP_STATUSES.has(delivery.status) ? (
            <View style={styles.actionSection}>
              <View style={styles.actionIntro}>
                <Text style={styles.sectionTitle}>Collect the order</Text>
                <Text style={styles.sectionBody}>Confirm only when the parcel or food is physically in your possession.</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Confirm pickup" onPress={confirmPickup} disabled={busy} style={({ pressed }) => [styles.primaryButton, busy && styles.disabled, pressed && styles.pressed]}>
                <View><Text style={styles.primaryText}>{busy ? "Confirming…" : "Confirm pickup"}</Text><Text style={styles.primarySub}>After this, LetsGoRide handles the driving stages automatically.</Text></View>
                <MaterialCommunityIcons name="package-variant-closed-check" size={23} color="#FFFFFF" />
              </Pressable>
            </View>
          ) : null}

          {delivery.status === "IN_TRANSIT" ? (
            <ApproachRecipientCard delivery={delivery} />
          ) : null}

          {delivery.status === "ARRIVING" ? (
            <RecipientHandoffCard
              delivery={delivery}
              pin={handoffPin}
              busy={busy}
              onChangePin={setHandoffPin}
              onConfirm={confirmHandoff}
            />
          ) : null}

          {delivery.status === "DELIVERED" ? (
            <View style={styles.completedCard}>
              <View style={styles.completedIcon}><MaterialCommunityIcons name="check" size={25} color="#FFFFFF" /></View>
              <View style={styles.completedCopy}>
                <Text style={styles.completedTitle}>Delivered & verified</Text>
                <Text style={styles.completedBody}>Recipient code accepted. Tracking stopped and the completed payout is recorded.</Text>
              </View>
            </View>
          ) : null}

          {TRACKING_STATUSES.has(delivery.status) ? (
            <View style={styles.delaySection}>
              {!delayOpen ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Report delay" onPress={() => setDelayOpen(true)} style={({ pressed }) => [styles.delayButton, pressed && styles.pressed]}>
                  <MaterialCommunityIcons name="clock-alert-outline" size={20} color={v2Theme.colors.ink} />
                  <Text style={styles.delayButtonText}>Something delaying you?</Text>
                </Pressable>
              ) : (
                <View style={styles.delayCard}>
                  <Text style={styles.delayTitle}>What is causing the delay?</Text>
                  <TextInput
                    accessibilityLabel="Delay note"
                    value={delayNote}
                    onChangeText={setDelayNote}
                    placeholder="e.g. Restaurant says 8 more minutes"
                    placeholderTextColor={v2Theme.colors.inkTertiary}
                    multiline
                    maxLength={300}
                    style={styles.delayInput}
                  />
                  <View style={styles.delayActions}>
                    <Pressable accessibilityRole="button" onPress={() => setDelayOpen(false)} style={styles.secondaryButton}><Text style={styles.secondaryText}>Cancel</Text></Pressable>
                    <Pressable accessibilityRole="button" onPress={submitDelay} disabled={busy} style={[styles.delaySubmit, busy && styles.disabled]}><Text style={styles.delaySubmitText}>Send update</Text></Pressable>
                  </View>
                </View>
              )}
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Delivery details</Text>
            <View style={styles.detailCard}>
              <DetailRow icon="store-marker-outline" title="Pickup" body={delivery.pickup_address} />
              <DetailRow icon="map-marker-outline" title="Drop-off" body={delivery.dropoff_address} />
              <DetailRow icon="account-outline" title="Recipient" body={delivery.recipient_name} />
              <DetailRow icon="phone-outline" title="Phone" body={delivery.recipient_phone} />
              {delivery.package_description ? <DetailRow icon="package-variant" title="Package" body={delivery.package_description} /> : null}
            </View>
          </View>

          {events.length ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Journey</Text><Text style={styles.activityCount}>{events.length}</Text></View>
              <View style={styles.eventCard}>
                {events.slice().reverse().slice(0, 6).map((event, index) => (
                  <View key={event.id} style={[styles.eventRow, index > 0 && styles.eventBorder]}>
                    <View style={styles.eventDot} />
                    <View style={styles.eventCopy}><Text style={styles.eventTitle}>{friendlyEvent(event.type)}</Text><Text style={styles.eventTime}>{formatTime(event.created_at)}</Text></View>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

function CourierLoadingState() {
  return (
    <View style={styles.loadingCard}>
      <View style={styles.loadingIcon}><MaterialCommunityIcons name="bike-fast" size={28} color={v2Theme.colors.brandStrong} /></View>
      <View style={styles.loadingCopy}><Text style={styles.loadingTitle}>Opening your delivery</Text><Text style={styles.loadingBody}>Getting the latest route and job status…</Text></View>
      <ActivityIndicator size="small" color={v2Theme.colors.brandStrong} />
    </View>
  );
}

function JourneyStrip({ status }: { status: CourierStatus }) {
  const step = journeyStep(status);
  const labels = ["Pickup", "On the way", "Handoff"];
  return (
    <View style={styles.journeyStrip}>
      {labels.map((label, index) => {
        const active = index <= step;
        return (
          <View key={label} style={styles.journeyStep}>
            <View style={[styles.journeyDot, active && styles.journeyDotActive]}>
              {index < step ? <MaterialCommunityIcons name="check" size={12} color="#FFFFFF" /> : <Text style={[styles.journeyNumber, active && styles.journeyNumberActive]}>{index + 1}</Text>}
            </View>
            <Text style={[styles.journeyLabel, active && styles.journeyLabelActive]}>{label}</Text>
            {index < labels.length - 1 ? <View style={[styles.journeyLine, index < step && styles.journeyLineActive]} /> : null}
          </View>
        );
      })}
    </View>
  );
}

function ApproachRecipientCard({ delivery }: { delivery: CourierDelivery }) {
  const distance = deliveryDistanceMeters(delivery);
  return (
    <View style={styles.handoffLockedCard}>
      <View style={styles.handoffIcon}><MaterialCommunityIcons name="shield-lock-outline" size={27} color={v2Theme.colors.brandStrong} /></View>
      <View style={styles.handoffCopy}>
        <Text style={styles.handoffTitle}>Handoff protected</Text>
        <Text style={styles.handoffBody}>Keep driving to the recipient. LetsGoRide will unlock the 4-digit handoff when you are close enough to the saved drop-off pin.</Text>
        {distance != null ? <Text style={styles.distanceText}>{formatDistance(distance)} from drop-off</Text> : null}
      </View>
    </View>
  );
}

function RecipientHandoffCard({
  delivery,
  pin,
  busy,
  onChangePin,
  onConfirm,
}: {
  delivery: CourierDelivery;
  pin: string;
  busy: boolean;
  onChangePin: (value: string) => void;
  onConfirm: () => void;
}) {
  const distance = deliveryDistanceMeters(delivery);
  const unlocked = isHandoffUnlocked(delivery);
  return (
    <View style={[styles.handoffCard, unlocked && styles.handoffCardReady]}>
      <View style={[styles.handoffIcon, unlocked && styles.handoffIconReady]}>
        <MaterialCommunityIcons name={unlocked ? "shield-key-outline" : "map-marker-radius-outline"} size={27} color={unlocked ? "#FFFFFF" : v2Theme.colors.brandStrong} />
      </View>
      <View style={styles.handoffCopy}>
        <Text style={styles.handoffTitle}>{unlocked ? "Ready for recipient code" : "Move closer for handoff"}</Text>
        <Text style={styles.handoffBody}>{unlocked ? "Ask the recipient for their 4-digit LetsGoRide code only when the order is physically with them." : `Delivery completion unlocks within ${HANDOFF_RADIUS_METERS} m of the saved drop-off pin.`}</Text>
        {distance != null ? <Text style={[styles.distanceText, unlocked && styles.distanceTextReady]}>{formatDistance(distance)} from drop-off</Text> : null}
        {unlocked ? (
          <>
            <TextInput
              accessibilityLabel="Recipient delivery code"
              value={pin}
              onChangeText={(value) => onChangePin(value.replace(/\D/g, "").slice(0, 4))}
              keyboardType="number-pad"
              maxLength={4}
              placeholder="4-digit code"
              placeholderTextColor={v2Theme.colors.inkTertiary}
              style={styles.pinInput}
            />
            <Pressable accessibilityRole="button" accessibilityLabel="Verify delivery code" disabled={pin.length !== 4 || busy} onPress={onConfirm} style={({ pressed }) => [styles.handoffButton, (pin.length !== 4 || busy) && styles.disabled, pressed && styles.pressed]}>
              <Text style={styles.handoffButtonText}>{busy ? "Checking…" : "Verify code & deliver"}</Text>
              <MaterialCommunityIcons name="check-decagram-outline" size={20} color="#FFFFFF" />
            </Pressable>
          </>
        ) : null}
      </View>
    </View>
  );
}

function journeyStep(status: CourierStatus) {
  if (status === "DELIVERED") return 2;
  if (status === "ARRIVING") return 2;
  if (status === "PICKED_UP" || status === "IN_TRANSIT") return 1;
  return 0;
}

function courierStatusCopy(status: CourierStatus) {
  if (status === "ASSIGNED" || status === "COURIER_TO_PICKUP") return "Head to pickup";
  if (status === "PICKED_UP" || status === "IN_TRANSIT") return "On the way";
  if (status === "ARRIVING") return "Almost there";
  if (status === "DELIVERED") return "Delivered";
  if (status === "CANCELLED") return "Cancelled";
  if (status === "FAILED") return "Needs support";
  return status.replaceAll("_", " ").toLowerCase();
}

function trackingCopy(status: CourierStatus) {
  if (status === "ASSIGNED" || status === "COURIER_TO_PICKUP") return "Go to pickup. No extra status buttons are needed.";
  if (status === "PICKED_UP" || status === "IN_TRANSIT") return "Your location keeps the customer and merchant updated automatically.";
  if (status === "ARRIVING") return "You are close. The recipient handoff is protected by location + PIN.";
  return "Journey updates are automatic while this delivery is active.";
}

function friendlyEvent(value: string) {
  const known: Record<string, string> = {
    DELIVERY_REQUESTED: "Delivery requested",
    DELIVERY_QUOTED: "Route and price ready",
    COURIER_CLAIMED_OFFER: "You accepted the delivery",
    COURIER_ASSIGNED: "Delivery assigned",
    STATUS_COURIER_TO_PICKUP: "Heading to pickup",
    STATUS_PICKED_UP: "Order collected",
    STATUS_IN_TRANSIT: "Journey started",
    STATUS_ARRIVING: "Near recipient",
    COURIER_DELAY_REPORTED: "Delay update sent",
    DELIVERY_CONFIRMED_BY_PIN: "Recipient code verified",
  };
  return known[value] || value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function deliveryDistanceMeters(delivery: CourierDelivery) {
  return distanceMeters(delivery.last_courier_location, delivery.dropoff_location);
}

function isHandoffUnlocked(delivery: CourierDelivery) {
  const distance = deliveryDistanceMeters(delivery);
  return delivery.status === "ARRIVING" && distance != null && distance <= HANDOFF_RADIUS_METERS;
}

function distanceMeters(
  a?: { latitude: number; longitude: number } | null,
  b?: { latitude: number; longitude: number } | null,
) {
  if (!a || !b) return null;
  const toRadians = (value: number) => value * Math.PI / 180;
  const earthRadius = 6371000;
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLng = toRadians(b.longitude - a.longitude);
  const h = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function formatDistance(distance: number) {
  if (distance < 1000) return `${Math.max(0, Math.round(distance))} m`;
  return `${(distance / 1000).toFixed(1)} km`;
}

function DetailRow({ icon, title, body }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; body: string }) {
  return <View style={styles.detailRow}><View style={styles.detailIcon}><MaterialCommunityIcons name={icon} size={20} color={v2Theme.colors.inkSecondary} /></View><View style={styles.detailCopy}><Text style={styles.detailTitle}>{title}</Text><Text style={styles.detailBody}>{body}</Text></View></View>;
}

const styles = StyleSheet.create({
  loadingCard: { minHeight: 82, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  loadingIcon: { width: 50, height: 50, borderRadius: 18, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" },
  loadingCopy: { flex: 1, gap: 3 },
  loadingTitle: { color: v2Theme.colors.ink, fontSize: 13, fontWeight: "900" },
  loadingBody: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14 },
  errorCard: { borderRadius: 18, backgroundColor: v2Theme.colors.dangerSoft, padding: 13, flexDirection: "row", alignItems: "center", gap: 9 },
  errorText: { flex: 1, color: v2Theme.colors.danger, fontSize: 11, fontWeight: "700" },
  retry: { color: v2Theme.colors.danger, fontSize: 10, fontWeight: "900" },
  messageCard: { borderRadius: 18, backgroundColor: v2Theme.colors.brandSofter, padding: 13, flexDirection: "row", alignItems: "center", gap: 9 },
  messageText: { flex: 1, color: v2Theme.colors.ink, fontSize: 11, lineHeight: 16, fontWeight: "700" },
  heroCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.ink, padding: 17, gap: 13 },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  heroIcon: { width: 52, height: 52, borderRadius: 19, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  heroCopy: { flex: 1, gap: 3 },
  heroEyebrow: { color: "rgba(255,255,255,0.48)", fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  heroTitle: { color: "#FFFFFF", fontSize: 21, fontWeight: "900", letterSpacing: -0.35 },
  payoutWrap: { alignItems: "flex-end", gap: 2 },
  payoutLabel: { color: "rgba(255,255,255,0.45)", fontSize: 7, fontWeight: "900" },
  payoutValue: { color: "#FFFFFF", fontSize: 19, fontWeight: "900" },
  heroRoute: { color: "rgba(255,255,255,0.86)", fontSize: 12, lineHeight: 18, fontWeight: "800" },
  journeyStrip: { flexDirection: "row", alignItems: "center", paddingTop: 4 },
  journeyStep: { flex: 1, flexDirection: "row", alignItems: "center" },
  journeyDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  journeyDotActive: { backgroundColor: v2Theme.colors.brand },
  journeyNumber: { color: "rgba(255,255,255,0.46)", fontSize: 8, fontWeight: "900" },
  journeyNumberActive: { color: "#FFFFFF" },
  journeyLabel: { marginLeft: 5, color: "rgba(255,255,255,0.38)", fontSize: 8, fontWeight: "800" },
  journeyLabelActive: { color: "#FFFFFF" },
  journeyLine: { flex: 1, height: 2, marginHorizontal: 6, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 1 },
  journeyLineActive: { backgroundColor: v2Theme.colors.brand },
  navigationButton: { minHeight: 72, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.brand, padding: 12, flexDirection: "row", alignItems: "center", gap: 11 },
  navigationIcon: { width: 47, height: 47, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
  navigationCopy: { flex: 1, gap: 3 },
  navigationTitle: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  navigationBody: { color: "rgba(255,255,255,0.72)", fontSize: 9, lineHeight: 13 },
  trackingCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.brandSofter, padding: 13, flexDirection: "row", alignItems: "center", gap: 10 },
  trackingIcon: { width: 47, height: 47, borderRadius: 16, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" },
  trackingIconActive: { backgroundColor: v2Theme.colors.brand },
  trackingCopy: { flex: 1, gap: 3 },
  trackingTitle: { color: v2Theme.colors.ink, fontSize: 11, fontWeight: "900" },
  trackingBody: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14 },
  livePill: { borderRadius: 999, backgroundColor: v2Theme.colors.surface, paddingHorizontal: 9, paddingVertical: 6 },
  livePillActive: { backgroundColor: v2Theme.colors.brandSoft },
  liveText: { color: v2Theme.colors.inkSecondary, fontSize: 7, fontWeight: "900" },
  liveTextActive: { color: v2Theme.colors.brandStrong },
  actionSection: { gap: 10 },
  actionIntro: { gap: 3 },
  section: { gap: 10 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: v2Theme.colors.ink, fontSize: 20, fontWeight: "900", letterSpacing: -0.4 },
  sectionBody: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15 },
  primaryButton: { minHeight: 68, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.ink, paddingHorizontal: 17, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  primaryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  primarySub: { color: "rgba(255,255,255,0.62)", fontSize: 8, marginTop: 3, maxWidth: 275 },
  handoffLockedCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.brandSofter, padding: 15, flexDirection: "row", gap: 12 },
  handoffCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, padding: 15, flexDirection: "row", gap: 12 },
  handoffCardReady: { borderColor: v2Theme.colors.brand },
  handoffIcon: { width: 52, height: 52, borderRadius: 18, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" },
  handoffIconReady: { backgroundColor: v2Theme.colors.brand },
  handoffCopy: { flex: 1, gap: 9 },
  handoffTitle: { color: v2Theme.colors.ink, fontSize: 17, fontWeight: "900" },
  handoffBody: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15 },
  distanceText: { alignSelf: "flex-start", color: v2Theme.colors.ink, fontSize: 9, fontWeight: "900", backgroundColor: v2Theme.colors.surface, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  distanceTextReady: { color: v2Theme.colors.brandStrong, backgroundColor: v2Theme.colors.brandSoft },
  pinInput: { minHeight: 56, borderRadius: 17, backgroundColor: v2Theme.colors.surfaceMuted, color: v2Theme.colors.ink, fontSize: 24, fontWeight: "900", letterSpacing: 8, textAlign: "center" },
  handoffButton: { minHeight: 54, borderRadius: 17, backgroundColor: v2Theme.colors.brand, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  handoffButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  completedCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.brandSofter, padding: 14, flexDirection: "row", alignItems: "center", gap: 11 },
  completedIcon: { width: 48, height: 48, borderRadius: 17, backgroundColor: v2Theme.colors.brand, alignItems: "center", justifyContent: "center" },
  completedCopy: { flex: 1, gap: 3 },
  completedTitle: { color: v2Theme.colors.ink, fontSize: 14, fontWeight: "900" },
  completedBody: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14 },
  delaySection: { gap: 8 },
  delayButton: { minHeight: 48, borderRadius: 16, backgroundColor: v2Theme.colors.surfaceMuted, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  delayButtonText: { color: v2Theme.colors.ink, fontSize: 11, fontWeight: "900" },
  delayCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surfaceMuted, padding: 13, gap: 9 },
  delayTitle: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900" },
  delayInput: { minHeight: 72, borderRadius: 15, backgroundColor: v2Theme.colors.surface, color: v2Theme.colors.ink, padding: 11, textAlignVertical: "top", fontSize: 11 },
  delayActions: { flexDirection: "row", gap: 8 },
  secondaryButton: { flex: 1, minHeight: 44, borderRadius: 14, backgroundColor: v2Theme.colors.surface, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: v2Theme.colors.ink, fontSize: 10, fontWeight: "900" },
  delaySubmit: { flex: 1.4, minHeight: 44, borderRadius: 14, backgroundColor: v2Theme.colors.ink, alignItems: "center", justifyContent: "center" },
  delaySubmitText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  detailCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, overflow: "hidden" },
  detailRow: { minHeight: 67, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: v2Theme.colors.line },
  detailIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  detailCopy: { flex: 1, gap: 3 },
  detailTitle: { color: v2Theme.colors.inkSecondary, fontSize: 8, fontWeight: "800" },
  detailBody: { color: v2Theme.colors.ink, fontSize: 11, lineHeight: 16, fontWeight: "800" },
  eventCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, paddingHorizontal: 13 },
  eventRow: { minHeight: 55, flexDirection: "row", alignItems: "center", gap: 10 },
  eventBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: v2Theme.colors.line },
  eventDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: v2Theme.colors.brand },
  eventCopy: { flex: 1, gap: 3 },
  eventTitle: { color: v2Theme.colors.ink, fontSize: 10, fontWeight: "900" },
  eventTime: { color: v2Theme.colors.inkTertiary, fontSize: 8, fontWeight: "700" },
  activityCount: { minWidth: 27, height: 27, borderRadius: 14, backgroundColor: v2Theme.colors.surfaceMuted, textAlign: "center", textAlignVertical: "center", color: v2Theme.colors.inkSecondary, fontSize: 9, fontWeight: "900" },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75 },
});
