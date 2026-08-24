import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DeliveryMap } from "../../../components/maps/DeliveryMap";
import { Screen } from "../../../components/ui/Screen";
import { v2Theme } from "../../../constants/v2Theme";
import { useLiveRefresh } from "../../../hooks/useLiveRefresh";
import {
  completeCourierDeliveryWithPin,
  getCourierDelivery,
  getCourierEvents,
  reportCourierDelay,
  updateCourierDeliveryStatus,
  updateCourierLocation,
} from "../../../services/courierService";
import { DeviceLocation, isReliableCourierLocation, watchForegroundLocation } from "../../../services/locationService";
import { CourierDelivery, CourierEvent, CourierGeoPoint, CourierStatus } from "../../../types/courier.types";
import { openNavigation } from "../../../utils/openNavigation";
import { decodePolyline } from "../../../utils/decodePolyline";
import { displayDeliveryReference } from "../../../utils/displayText";

const ACTIVE = new Set<CourierStatus>(["ASSIGNED", "COURIER_TO_PICKUP", "PICKED_UP", "IN_TRANSIT", "ARRIVING"]);
const BEFORE_PICKUP = new Set<CourierStatus>(["ASSIGNED", "COURIER_TO_PICKUP"]);
const AFTER_PICKUP = new Set<CourierStatus>(["PICKED_UP", "IN_TRANSIT", "ARRIVING"]);
const HANDOFF_RADIUS_METERS = 250;

export default function CourierDeliveryScreen() {
  const { deliveryId } = useLocalSearchParams<{ deliveryId: string }>();
  const [delivery, setDelivery] = useState<CourierDelivery | null>(null);
  const [events, setEvents] = useState<CourierEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [gpsLive, setGpsLive] = useState(false);
  const [openingMaps, setOpeningMaps] = useState(false);
  const [pin, setPin] = useState("");
  const [delayOpen, setDelayOpen] = useState(false);
  const [delayNote, setDelayNote] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const locationWatcher = useRef<{ remove: () => void } | null>(null);
  const locationStarting = useRef(false);
  const locationWriteInFlight = useRef(false);
  const gpsGeneration = useRef(0);
  const lastAcceptedLocation = useRef<DeviceLocation | null>(null);

  const refresh = useCallback(async () => {
    if (!deliveryId) return;
    try {
      const [job, journey] = await Promise.all([
        getCourierDelivery(deliveryId),
        getCourierEvents(deliveryId),
      ]);
      setDelivery(job);
      setEvents(journey);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to open this delivery.");
    } finally {
      setLoading(false);
    }
  }, [deliveryId]);

  useFocusEffect(useCallback(() => {
    void refresh();
    return () => {
      locationWatcher.current?.remove();
      locationWatcher.current = null;
      locationStarting.current = false;
      locationWriteInFlight.current = false;
    };
  }, [delivery?.status, refresh]));

  useLiveRefresh(refresh, 10000, Boolean(delivery?.status && ACTIVE.has(delivery.status)));

  const stopGps = useCallback(() => {
    gpsGeneration.current += 1;
    locationWatcher.current?.remove();
    locationWatcher.current = null;
    lastAcceptedLocation.current = null;
    setGpsLive(false);
  }, []);

  const startGps = useCallback(async (job: CourierDelivery) => {
    if (locationWatcher.current || locationStarting.current || !ACTIVE.has(job.status)) return;
    locationStarting.current = true;
    const generation = gpsGeneration.current;
    try {
      const watcher = await watchForegroundLocation(
        (location) => {
          if (locationWriteInFlight.current) return;
          if (!isReliableCourierLocation(location, lastAcceptedLocation.current)) return;
          lastAcceptedLocation.current = location;
          setDelivery((current) => current ? { ...current, last_courier_location: location } : current);
          locationWriteInFlight.current = true;
          updateCourierLocation(job.id, {
            latitude: location.latitude,
            longitude: location.longitude,
            accuracy: location.accuracy,
            heading: location.heading,
            speed: location.speed,
            recorded_at: new Date(location.timestamp).toISOString(),
          }).then((updated) => {
            setDelivery(updated);
            if (!ACTIVE.has(updated.status)) stopGps();
          }).catch((err) => {
            // Automatic sensor writes belong in engineering diagnostics. The
            // delivery screen keeps the last server state and stops the noisy
            // watcher instead of showing raw validation copy to the courier.
            console.warn("courier_location_update_failed", err);
            stopGps();
          }).finally(() => {
            locationWriteInFlight.current = false;
          });
        },
        (err) => setNotice(err.message),
      );
      const stillForeground = !["background", "inactive"].includes(String(AppState.currentState || "active"));
      if (generation !== gpsGeneration.current || !stillForeground) {
        watcher.remove();
        return;
      }
      locationWatcher.current = watcher;
      setGpsLive(true);
    } catch (err) {
      setGpsLive(false);
      setError(err instanceof Error ? err.message : "Live location could not start.");
    } finally {
      locationStarting.current = false;
    }
  }, [stopGps]);

  useEffect(() => {
    if (!delivery) return;
    if (!ACTIVE.has(delivery.status)) {
      stopGps();
      return;
    }
    const foreground = !["background", "inactive"].includes(String(AppState.currentState || "active"));
    if (foreground && !locationWatcher.current) startGps(delivery);
  }, [delivery?.id, delivery?.status, startGps, stopGps]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" && delivery && ACTIVE.has(delivery.status)) {
        void startGps(delivery);
      } else {
        stopGps();
      }
    });
    return () => subscription.remove();
  }, [delivery?.id, delivery?.status, startGps, stopGps]);

  async function navigate() {
    if (!delivery || openingMaps) return;
    const destination = BEFORE_PICKUP.has(delivery.status)
      ? { ...delivery.pickup_location, label: delivery.pickup_address }
      : AFTER_PICKUP.has(delivery.status)
        ? { ...delivery.dropoff_location, label: delivery.dropoff_address }
        : null;
    if (!destination) return;
    try {
      setOpeningMaps(true);
      setError(null);
      await openNavigation(destination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to open navigation.");
    } finally {
      setOpeningMaps(false);
    }
  }

  const route = useMemo(() => decodePolyline(delivery?.remaining_route_polyline || delivery?.route_polyline), [delivery?.remaining_route_polyline, delivery?.route_polyline]);

  async function confirmPickup() {
    if (!delivery || busy || !BEFORE_PICKUP.has(delivery.status)) return;
    try {
      setBusy(true);
      setNotice(null);
      setError(null);
      const updated = await updateCourierDeliveryStatus(delivery.id, "PICKED_UP");
      setDelivery(updated);
      setEvents(await getCourierEvents(delivery.id));
      setNotice("Order collected. LetsGoRide has switched the journey to the recipient.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pickup could not be confirmed.");
    } finally {
      setBusy(false);
    }
  }

  async function sendDelay() {
    if (!delivery || busy) return;
    try {
      setBusy(true);
      setNotice(null);
      setError(null);
      await reportCourierDelay(delivery.id, delayNote.trim() || undefined);
      setDelayOpen(false);
      setDelayNote("");
      setEvents(await getCourierEvents(delivery.id));
      setNotice("Delay update sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delay update could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  async function completeHandoff() {
    if (!delivery || busy || pin.length !== 4 || !handoffUnlocked(delivery)) return;
    try {
      setBusy(true);
      setNotice(null);
      setError(null);
      const updated = await completeCourierDeliveryWithPin(delivery.id, pin);
      setDelivery(updated);
      setPin("");
      setEvents(await getCourierEvents(delivery.id));
      stopGps();
      setNotice("Recipient code verified. Delivery complete.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delivery handoff could not be verified.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Screen showBack fallbackRoute="/(courier)/home" title="Delivery" showNotifications={false}>
        <View style={styles.loadingCard}>
          <View style={styles.loadingIcon}><MaterialCommunityIcons name="bike-fast" size={28} color={v2Theme.colors.brandStrong} /></View>
          <View style={styles.flex}><Text style={styles.loadingTitle}>Opening your delivery</Text><Text style={styles.muted}>Getting the latest route and job status…</Text></View>
          <ActivityIndicator size="small" color={v2Theme.colors.brandStrong} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen showBack fallbackRoute="/(courier)/home" title="Delivery" showNotifications={false}>
      {error ? (
        <Pressable accessibilityRole="button" onPress={refresh} style={styles.errorCard}>
          <MaterialCommunityIcons name="alert-circle-outline" size={21} color={v2Theme.colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.retry}>Retry</Text>
        </Pressable>
      ) : null}

      {notice ? (
        <View style={styles.noticeCard}>
          <MaterialCommunityIcons name="check-circle-outline" size={20} color={v2Theme.colors.brandStrong} />
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      ) : null}

      {delivery ? (
        <>
          <View style={styles.hero}>
            <View style={styles.heroTop}>
              <View style={styles.heroIcon}><MaterialCommunityIcons name={delivery.source_type === "FOOD_ORDER" ? "food-takeout-box-outline" : "package-variant-closed"} size={28} color={v2Theme.colors.brandStrong} /></View>
              <View style={styles.flex}>
                <Text style={styles.heroEyebrow}>{delivery.source_type === "FOOD_ORDER" ? "FOOD DELIVERY" : "COURIER DELIVERY"} · {displayDeliveryReference(delivery.id)}</Text>
                <Text style={styles.heroTitle}>{statusTitle(delivery.status)}</Text>
              </View>
              {delivery.courier_payout_usd != null ? <View style={styles.pay}><Text style={styles.payLabel}>YOUR PAY</Text><Text style={styles.payValue}>${delivery.courier_payout_usd.toFixed(2)}</Text></View> : null}
            </View>
            <Text style={styles.heroRoute}>{delivery.pickup_address} → {delivery.dropoff_address}</Text>
            <Journey status={delivery.status} />
          </View>

          <DeliveryMap pickup={delivery.pickup_location} dropoff={delivery.dropoff_location} courier={delivery.last_courier_location} courierHeading={delivery.last_courier_location?.heading} route={route} height={320} />

          <View style={styles.routeMetrics}>
            <RouteMetric icon="map-marker-distance" label={delivery.remaining_distance_km != null ? "REMAINING" : "PLANNED ROUTE"} value={delivery.remaining_distance_km != null ? `${delivery.remaining_distance_km.toFixed(1)} km` : delivery.distance_km != null ? `${delivery.distance_km.toFixed(1)} km` : "Route unavailable"} />
            <RouteMetric icon="clock-outline" label={delivery.remaining_eta_minutes != null ? "LIVE ETA" : "ROUTE ETA"} value={delivery.remaining_eta_minutes != null ? `${delivery.remaining_eta_minutes} min` : delivery.estimated_duration_minutes != null ? `${delivery.estimated_duration_minutes} min` : "ETA unavailable"} />
          </View>

          {ACTIVE.has(delivery.status) ? (
            <View style={styles.gpsCard}>
              <View style={[styles.gpsIcon, gpsLive && styles.gpsIconLive]}><MaterialCommunityIcons name="crosshairs-gps" size={24} color={gpsLive ? "#FFFFFF" : v2Theme.colors.brandStrong} /></View>
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>{gpsLive ? "Live journey active" : "Connecting live GPS…"}</Text>
                <Text style={styles.muted}>{gpsCopy(delivery.status)}</Text>
              </View>
              <View style={[styles.livePill, gpsLive && styles.livePillOn]}><Text style={[styles.liveText, gpsLive && styles.liveTextOn]}>{gpsLive ? "LIVE" : "AUTO"}</Text></View>
            </View>
          ) : null}

          {BEFORE_PICKUP.has(delivery.status) || AFTER_PICKUP.has(delivery.status) ? (
            <Pressable accessibilityRole="button" onPress={navigate} disabled={openingMaps} style={({ pressed }) => [styles.navigateButton, pressed && styles.pressed]}>
              <View style={styles.navigateIcon}><MaterialCommunityIcons name="navigation-variant" size={24} color="#FFFFFF" /></View>
              <View style={styles.flex}>
                <Text style={styles.navigateTitle}>{openingMaps ? "Opening maps…" : BEFORE_PICKUP.has(delivery.status) ? "Navigate to pickup" : "Navigate to recipient"}</Text>
                <Text numberOfLines={2} style={styles.navigateBody}>{BEFORE_PICKUP.has(delivery.status) ? delivery.pickup_address : delivery.dropoff_address}</Text>
              </View>
              <MaterialCommunityIcons name="arrow-top-right" size={21} color="#FFFFFF" />
            </Pressable>
          ) : null}

          {BEFORE_PICKUP.has(delivery.status) ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Collect the order</Text>
              <Text style={styles.muted}>Confirm only when the parcel or food is physically in your possession.</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Confirm pickup" disabled={busy} onPress={confirmPickup} style={({ pressed }) => [styles.primaryButton, busy && styles.disabled, pressed && styles.pressed]}>
                <View><Text style={styles.primaryText}>{busy ? "Confirming…" : "Confirm pickup"}</Text><Text style={styles.primarySub}>No manual “start trip” or “in transit” button after this.</Text></View>
                <MaterialCommunityIcons name="package-variant-closed-check" size={23} color="#FFFFFF" />
              </Pressable>
            </View>
          ) : null}

          {delivery.status === "IN_TRANSIT" ? <HandoffLocked delivery={delivery} /> : null}
          {delivery.status === "ARRIVING" ? <Handoff delivery={delivery} pin={pin} busy={busy} setPin={setPin} complete={completeHandoff} /> : null}

          {delivery.status === "DELIVERED" ? (
            <View style={styles.deliveredCard}>
              <View style={styles.deliveredIcon}><MaterialCommunityIcons name="check" size={25} color="#FFFFFF" /></View>
              <View style={styles.flex}><Text style={styles.deliveredTitle}>Delivered & verified</Text><Text style={styles.muted}>Recipient PIN accepted. Tracking is off and this earning is recorded in your history.</Text></View>
            </View>
          ) : null}

          {ACTIVE.has(delivery.status) ? (
            !delayOpen ? (
              <Pressable accessibilityRole="button" onPress={() => setDelayOpen(true)} style={({ pressed }) => [styles.delayButton, pressed && styles.pressed]}>
                <MaterialCommunityIcons name="clock-alert-outline" size={20} color={v2Theme.colors.ink} />
                <Text style={styles.delayButtonText}>Something delaying you?</Text>
              </Pressable>
            ) : (
              <View style={styles.delayCard}>
                <Text style={styles.cardTitle}>What’s causing the delay?</Text>
                <TextInput accessibilityLabel="Delay note" value={delayNote} onChangeText={setDelayNote} placeholder="e.g. Restaurant says 8 more minutes" placeholderTextColor={v2Theme.colors.inkTertiary} multiline maxLength={300} style={styles.delayInput} />
                <View style={styles.delayActions}>
                  <Pressable accessibilityRole="button" onPress={() => setDelayOpen(false)} style={styles.secondaryButton}><Text style={styles.secondaryText}>Cancel</Text></Pressable>
                  <Pressable accessibilityRole="button" onPress={sendDelay} disabled={busy} style={[styles.delaySend, busy && styles.disabled]}><Text style={styles.delaySendText}>Send update</Text></Pressable>
                </View>
              </View>
            )
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Delivery details</Text>
            <View style={styles.detailsCard}>
              <Detail icon="store-marker-outline" label="PICKUP" value={delivery.pickup_address} />
              <Detail icon="map-marker-outline" label="DROP-OFF" value={delivery.dropoff_address} />
              <Detail icon="account-outline" label="RECIPIENT" value={delivery.recipient_name} />
              <Detail icon="phone-outline" label="PHONE" value={delivery.recipient_phone} />
              {delivery.package_description ? <Detail icon="package-variant" label="PACKAGE" value={delivery.package_description} /> : null}
            </View>
          </View>

          {events.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Journey</Text>
              <View style={styles.eventsCard}>
                {events.slice().reverse().slice(0, 5).map((event, index) => (
                  <View key={event.id} style={[styles.eventRow, index > 0 && styles.eventBorder]}>
                    <View style={styles.eventDot} />
                    <View style={styles.flex}><Text style={styles.eventTitle}>{friendlyEvent(event.type)}</Text><Text style={styles.eventTime}>{formatTime(event.created_at)}</Text></View>
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

function Journey({ status }: { status: CourierStatus }) {
  const step = status === "ARRIVING" || status === "DELIVERED" ? 2 : status === "PICKED_UP" || status === "IN_TRANSIT" ? 1 : 0;
  return (
    <View style={styles.journey}>
      {["Pickup", "On the way", "Handoff"].map((label, index) => (
        <View key={label} style={styles.journeyPart}>
          <View style={[styles.stepDot, index <= step && styles.stepDotOn]}>{index < step ? <MaterialCommunityIcons name="check" size={11} color="#FFFFFF" /> : <Text style={styles.stepNumber}>{index + 1}</Text>}</View>
          <Text style={[styles.stepLabel, index <= step && styles.stepLabelOn]}>{label}</Text>
          {index < 2 ? <View style={[styles.stepLine, index < step && styles.stepLineOn]} /> : null}
        </View>
      ))}
    </View>
  );
}

function HandoffLocked({ delivery }: { delivery: CourierDelivery }) {
  const distance = distanceToDropoff(delivery);
  return (
    <View style={styles.handoffLocked}>
      <View style={styles.handoffIcon}><MaterialCommunityIcons name="shield-lock-outline" size={27} color={v2Theme.colors.brandStrong} /></View>
      <View style={styles.flex}>
        <Text style={styles.handoffTitle}>Handoff protected</Text>
        <Text style={styles.muted}>Keep driving. The delivery PIN unlocks only when you’re close to the saved recipient pin.</Text>
        {distance != null ? <DistanceBadge distance={distance} /> : null}
      </View>
    </View>
  );
}

function Handoff({ delivery, pin, busy, setPin, complete }: { delivery: CourierDelivery; pin: string; busy: boolean; setPin: (value: string) => void; complete: () => void }) {
  const distance = distanceToDropoff(delivery);
  const unlocked = handoffUnlocked(delivery);
  return (
    <View style={[styles.handoffCard, unlocked && styles.handoffReady]}>
      <View style={[styles.handoffIcon, unlocked && styles.handoffIconReady]}><MaterialCommunityIcons name={unlocked ? "shield-key-outline" : "map-marker-radius-outline"} size={27} color={unlocked ? "#FFFFFF" : v2Theme.colors.brandStrong} /></View>
      <View style={styles.flex}>
        <Text style={styles.handoffTitle}>{unlocked ? "Ready for recipient code" : "Move closer for handoff"}</Text>
        <Text style={styles.muted}>{unlocked ? "Ask for the customer’s 4-digit code only when the order is physically with them." : `Completion unlocks within ${HANDOFF_RADIUS_METERS} m of the saved drop-off pin.`}</Text>
        {distance != null ? <DistanceBadge distance={distance} ready={unlocked} /> : null}
        {unlocked ? (
          <>
            <TextInput accessibilityLabel="Recipient delivery code" value={pin} onChangeText={(value) => setPin(value.replace(/\D/g, "").slice(0, 4))} keyboardType="number-pad" maxLength={4} placeholder="4-digit code" placeholderTextColor={v2Theme.colors.inkTertiary} style={styles.pinInput} />
            <Pressable accessibilityRole="button" disabled={pin.length !== 4 || busy} onPress={complete} style={({ pressed }) => [styles.handoffButton, (pin.length !== 4 || busy) && styles.disabled, pressed && styles.pressed]}>
              <Text style={styles.handoffButtonText}>{busy ? "Checking…" : "Verify code & deliver"}</Text>
              <MaterialCommunityIcons name="check-decagram-outline" size={20} color="#FFFFFF" />
            </Pressable>
          </>
        ) : null}
      </View>
    </View>
  );
}

function DistanceBadge({ distance, ready = false }: { distance: number; ready?: boolean }) {
  const text = distance < 1000 ? `${Math.round(distance)} m` : `${(distance / 1000).toFixed(1)} km`;
  return <View style={[styles.distanceBadge, ready && styles.distanceBadgeReady]}><MaterialCommunityIcons name="map-marker-distance" size={15} color={ready ? v2Theme.colors.brandStrong : v2Theme.colors.inkSecondary} /><Text style={[styles.distanceText, ready && styles.distanceTextReady]}>{text} from drop-off</Text></View>;
}

function distanceToDropoff(delivery: CourierDelivery) {
  return distanceMeters(delivery.last_courier_location, delivery.dropoff_location);
}

function handoffUnlocked(delivery: CourierDelivery) {
  const distance = distanceToDropoff(delivery);
  return delivery.status === "ARRIVING" && distance != null && distance <= HANDOFF_RADIUS_METERS;
}

function distanceMeters(a?: CourierGeoPoint | null, b?: CourierGeoPoint | null) {
  if (typeof a?.latitude !== "number" || typeof a?.longitude !== "number" || typeof b?.latitude !== "number" || typeof b?.longitude !== "number") return null;
  const radians = (value: number) => value * Math.PI / 180;
  const radius = 6371000;
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const dLat = radians(b.latitude - a.latitude);
  const dLng = radians(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function statusTitle(status: CourierStatus) {
  if (status === "ASSIGNED" || status === "COURIER_TO_PICKUP") return "Head to pickup";
  if (status === "PICKED_UP" || status === "IN_TRANSIT") return "On the way";
  if (status === "ARRIVING") return "Almost there";
  if (status === "DELIVERED") return "Delivered";
  if (status === "CANCELLED") return "Cancelled";
  if (status === "FAILED") return "Needs support";
  return status.replaceAll("_", " ").toLowerCase();
}

function gpsCopy(status: CourierStatus) {
  if (status === "ASSIGNED" || status === "COURIER_TO_PICKUP") return "Go to pickup. No extra progress buttons are needed.";
  if (status === "PICKED_UP" || status === "IN_TRANSIT") return "Your location updates the customer and merchant automatically.";
  if (status === "ARRIVING") return "Location + recipient PIN protect the final handoff.";
  return "Journey updates are automatic.";
}

function friendlyEvent(value: string) {
  const names: Record<string, string> = {
    DELIVERY_REQUESTED: "Delivery requested",
    DELIVERY_QUOTED: "Route and price ready",
    COURIER_CLAIMED_OFFER: "Delivery accepted",
    COURIER_ASSIGNED: "Delivery assigned",
    STATUS_COURIER_TO_PICKUP: "Heading to pickup",
    STATUS_PICKED_UP: "Order collected",
    STATUS_IN_TRANSIT: "Journey started",
    STATUS_ARRIVING: "Near recipient",
    COURIER_DELAY_REPORTED: "Delay update sent",
    DELIVERY_CONFIRMED_BY_PIN: "Recipient code verified",
  };
  return names[value] || value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function Detail({ icon, label, value }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string }) {
  return <View style={styles.detailRow}><View style={styles.detailIcon}><MaterialCommunityIcons name={icon} size={20} color={v2Theme.colors.inkSecondary} /></View><View style={styles.flex}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View></View>;
}

function RouteMetric({ icon, label, value }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.routeMetric}>
      <MaterialCommunityIcons name={icon} size={19} color={v2Theme.colors.brandStrong} />
      <View style={styles.flex}>
        <Text style={styles.routeMetricLabel}>{label}</Text>
        <Text style={styles.routeMetricValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  muted: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15 },
  pressed: { opacity: 0.74 },
  disabled: { opacity: 0.44 },
  loadingCard: { minHeight: 82, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  loadingIcon: { width: 50, height: 50, borderRadius: 18, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" },
  loadingTitle: { color: v2Theme.colors.ink, fontSize: 13, fontWeight: "900" },
  errorCard: { borderRadius: 18, backgroundColor: v2Theme.colors.dangerSoft, padding: 13, flexDirection: "row", alignItems: "center", gap: 9 },
  errorText: { flex: 1, color: v2Theme.colors.danger, fontSize: 11, fontWeight: "700" },
  retry: { color: v2Theme.colors.danger, fontSize: 10, fontWeight: "900" },
  noticeCard: { borderRadius: 18, backgroundColor: v2Theme.colors.brandSofter, padding: 13, flexDirection: "row", alignItems: "center", gap: 9 },
  noticeText: { flex: 1, color: v2Theme.colors.ink, fontSize: 11, lineHeight: 16, fontWeight: "700" },
  hero: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.ink, padding: 17, gap: 13 },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  heroIcon: { width: 52, height: 52, borderRadius: 19, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  heroEyebrow: { color: "rgba(255,255,255,0.48)", fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  heroTitle: { color: "#FFFFFF", fontSize: 21, fontWeight: "900", letterSpacing: -0.35 },
  heroRoute: { color: "rgba(255,255,255,0.86)", fontSize: 12, lineHeight: 18, fontWeight: "800" },
  pay: { alignItems: "flex-end" },
  payLabel: { color: "rgba(255,255,255,0.45)", fontSize: 7, fontWeight: "900" },
  payValue: { color: "#FFFFFF", fontSize: 19, fontWeight: "900" },
  journey: { flexDirection: "row", alignItems: "center" },
  journeyPart: { flex: 1, flexDirection: "row", alignItems: "center" },
  stepDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  stepDotOn: { backgroundColor: v2Theme.colors.brand },
  stepNumber: { color: "#FFFFFF", fontSize: 8, fontWeight: "900" },
  stepLabel: { marginLeft: 5, color: "rgba(255,255,255,0.38)", fontSize: 8, fontWeight: "800" },
  stepLabelOn: { color: "#FFFFFF" },
  stepLine: { flex: 1, height: 2, marginHorizontal: 6, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 1 },
  stepLineOn: { backgroundColor: v2Theme.colors.brand },
  gpsCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.brandSofter, padding: 13, flexDirection: "row", alignItems: "center", gap: 10 },
  gpsIcon: { width: 47, height: 47, borderRadius: 16, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" },
  gpsIconLive: { backgroundColor: v2Theme.colors.brand },
  cardTitle: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900" },
  livePill: { borderRadius: 999, backgroundColor: v2Theme.colors.surface, paddingHorizontal: 9, paddingVertical: 6 },
  livePillOn: { backgroundColor: v2Theme.colors.brandSoft },
  liveText: { color: v2Theme.colors.inkSecondary, fontSize: 7, fontWeight: "900" },
  liveTextOn: { color: v2Theme.colors.brandStrong },
  navigateButton: { minHeight: 72, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.brand, padding: 12, flexDirection: "row", alignItems: "center", gap: 11 },
  navigateIcon: { width: 47, height: 47, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
  navigateTitle: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  navigateBody: { color: "rgba(255,255,255,0.72)", fontSize: 9, lineHeight: 13 },
  routeMetrics: { flexDirection: "row", gap: 8 },
  routeMetric: { flex: 1, minHeight: 62, borderRadius: 18, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 9 },
  routeMetricLabel: { color: v2Theme.colors.inkTertiary, fontSize: 7, fontWeight: "900", letterSpacing: 0.45 },
  routeMetricValue: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900", marginTop: 2 },
  section: { gap: 9 },
  sectionTitle: { color: v2Theme.colors.ink, fontSize: 20, fontWeight: "900", letterSpacing: -0.4 },
  primaryButton: { minHeight: 68, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.ink, paddingHorizontal: 17, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  primaryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  primarySub: { color: "rgba(255,255,255,0.62)", fontSize: 8, marginTop: 3, maxWidth: 275 },
  handoffLocked: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.brandSofter, padding: 15, flexDirection: "row", gap: 12 },
  handoffCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, padding: 15, flexDirection: "row", gap: 12 },
  handoffReady: { borderColor: v2Theme.colors.brand },
  handoffIcon: { width: 52, height: 52, borderRadius: 18, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" },
  handoffIconReady: { backgroundColor: v2Theme.colors.brand },
  handoffTitle: { color: v2Theme.colors.ink, fontSize: 17, fontWeight: "900" },
  distanceBadge: { alignSelf: "flex-start", marginTop: 8, borderRadius: 999, backgroundColor: v2Theme.colors.surface, paddingHorizontal: 9, paddingVertical: 5, flexDirection: "row", gap: 5, alignItems: "center" },
  distanceBadgeReady: { backgroundColor: v2Theme.colors.brandSoft },
  distanceText: { color: v2Theme.colors.inkSecondary, fontSize: 9, fontWeight: "900" },
  distanceTextReady: { color: v2Theme.colors.brandStrong },
  pinInput: { minHeight: 56, marginTop: 10, borderRadius: 17, backgroundColor: v2Theme.colors.surfaceMuted, color: v2Theme.colors.ink, fontSize: 24, fontWeight: "900", letterSpacing: 8, textAlign: "center" },
  handoffButton: { minHeight: 54, marginTop: 9, borderRadius: 17, backgroundColor: v2Theme.colors.brand, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  handoffButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  deliveredCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.brandSofter, padding: 14, flexDirection: "row", alignItems: "center", gap: 11 },
  deliveredIcon: { width: 48, height: 48, borderRadius: 17, backgroundColor: v2Theme.colors.brand, alignItems: "center", justifyContent: "center" },
  deliveredTitle: { color: v2Theme.colors.ink, fontSize: 14, fontWeight: "900" },
  delayButton: { minHeight: 48, borderRadius: 16, backgroundColor: v2Theme.colors.surfaceMuted, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  delayButtonText: { color: v2Theme.colors.ink, fontSize: 11, fontWeight: "900" },
  delayCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surfaceMuted, padding: 13, gap: 9 },
  delayInput: { minHeight: 72, borderRadius: 15, backgroundColor: v2Theme.colors.surface, color: v2Theme.colors.ink, padding: 11, textAlignVertical: "top", fontSize: 11 },
  delayActions: { flexDirection: "row", gap: 8 },
  secondaryButton: { flex: 1, minHeight: 44, borderRadius: 14, backgroundColor: v2Theme.colors.surface, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: v2Theme.colors.ink, fontSize: 10, fontWeight: "900" },
  delaySend: { flex: 1.4, minHeight: 44, borderRadius: 14, backgroundColor: v2Theme.colors.ink, alignItems: "center", justifyContent: "center" },
  delaySendText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  detailsCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, overflow: "hidden" },
  detailRow: { minHeight: 67, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: v2Theme.colors.line },
  detailIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  detailLabel: { color: v2Theme.colors.inkSecondary, fontSize: 8, fontWeight: "900" },
  detailValue: { color: v2Theme.colors.ink, fontSize: 11, lineHeight: 16, fontWeight: "800" },
  eventsCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, paddingHorizontal: 13 },
  eventRow: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: 10 },
  eventBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: v2Theme.colors.line },
  eventDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: v2Theme.colors.brand },
  eventTitle: { color: v2Theme.colors.ink, fontSize: 10, fontWeight: "900" },
  eventTime: { color: v2Theme.colors.inkTertiary, fontSize: 8, marginTop: 2 },
});
