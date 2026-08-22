import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";

import { DeliveryMap } from "../../../components/maps/DeliveryMap";
import { Screen } from "../../../components/ui/Screen";
import { v2Theme } from "../../../constants/v2Theme";
import { getCourierDelivery, getCourierTracking } from "../../../services/courierService";
import { CourierDelivery, CourierTrackingState } from "../../../types/courier.types";

export default function CourierDeliveryScreen() {
  const { deliveryId } = useLocalSearchParams<{ deliveryId: string }>();
  const [delivery, setDelivery] = useState<CourierDelivery | null>(null);
  const [tracking, setTracking] = useState<CourierTrackingState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!deliveryId) return;
    try {
      setError(null);
      const [nextDelivery, nextTracking] = await Promise.all([
        getCourierDelivery(deliveryId),
        getCourierTracking(deliveryId),
      ]);
      setDelivery(nextDelivery);
      setTracking(nextTracking);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load delivery.");
    } finally {
      setLoading(false);
    }
  }, [deliveryId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [load]);

  const pickup = delivery?.pickup_location || null;
  const dropoff = delivery?.dropoff_location || null;
  const courier = tracking?.last_courier_location || null;

  return (
    <Screen showBack fallbackRoute="/(shared)/activity" title="Delivery" showNotifications={false}>
      {loading ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>Loading delivery…</Text>
        </View>
      ) : null}

      {error ? (
        <Pressable onPress={load} style={styles.errorCard}>
          <MaterialCommunityIcons name="alert-circle-outline" size={23} color={v2Theme.colors.danger} />
          <View style={styles.stateCopy}>
            <Text style={styles.errorTitle}>Couldn’t load this delivery</Text>
            <Text style={styles.stateBody}>{error}</Text>
          </View>
          <Text style={styles.retry}>Retry</Text>
        </Pressable>
      ) : null}

      {delivery ? (
        <>
          <View style={styles.hero}>
            <View style={styles.statusRow}>
              <View style={styles.statusPill}>
                <View style={styles.statusDot} />
                <Text style={styles.statusText}>{delivery.status.replaceAll("_", " ")}</Text>
              </View>
              <Text style={styles.reference}>#{delivery.id.slice(0, 8).toUpperCase()}</Text>
            </View>
            <Text style={styles.title}>Your package, on one clear journey.</Text>
            <Text style={styles.body}>{statusMessage(delivery.status)}</Text>
          </View>

          <DeliveryMap pickup={pickup} dropoff={dropoff} courier={courier} />

          <View style={styles.routeCard}>
            <RouteRow icon="circle-slice-8" label="Pickup" value={delivery.pickup_address} brand />
            <View style={styles.divider} />
            <RouteRow icon="map-marker" label="Drop-off" value={delivery.dropoff_address} />
          </View>

          <View style={styles.detailsGrid}>
            <DetailCard icon="package-variant-closed" label="Package" value={formatPackageType(delivery.package_type)} />
            <DetailCard icon="account-outline" label="Recipient" value={delivery.recipient_name} />
            <DetailCard icon="motorbike" label="Courier" value={delivery.courier_name || "Matching in progress"} />
            <DetailCard
              icon="map-marker-distance"
              label="Distance"
              value={typeof delivery.distance_km === "number" ? `${delivery.distance_km.toFixed(1)} km` : "Calculating"}
            />
          </View>

          <View style={styles.trackingCard}>
            <View style={styles.trackingIcon}>
              <MaterialCommunityIcons
                name={tracking?.live_tracking_active ? "crosshairs-gps" : "map-marker-off-outline"}
                size={24}
                color={tracking?.live_tracking_active ? v2Theme.colors.brandStrong : v2Theme.colors.inkSecondary}
              />
            </View>
            <View style={styles.stateCopy}>
              <Text style={styles.trackingTitle}>{tracking?.live_tracking_active ? "Live tracking active" : "Live tracking not active"}</Text>
              <Text style={styles.stateBody}>
                {tracking?.live_tracking_active
                  ? "Courier position refreshes while the delivery is active."
                  : "Tracking starts only when an assigned courier begins the active delivery workflow."}
              </Text>
            </View>
          </View>
        </>
      ) : null}
    </Screen>
  );
}

function RouteRow({ icon, label, value, brand = false }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string; brand?: boolean }) {
  return (
    <View style={styles.routeRow}>
      <View style={[styles.routeIcon, brand && styles.routeIconBrand]}>
        <MaterialCommunityIcons name={icon} size={20} color={brand ? v2Theme.colors.brandStrong : v2Theme.colors.ink} />
      </View>
      <View style={styles.routeCopy}>
        <Text style={styles.routeLabel}>{label}</Text>
        <Text numberOfLines={2} style={styles.routeValue}>{value}</Text>
      </View>
    </View>
  );
}

function DetailCard({ icon, label, value }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.detailCard}>
      <MaterialCommunityIcons name={icon} size={21} color={v2Theme.colors.inkSecondary} />
      <Text style={styles.detailLabel}>{label}</Text>
      <Text numberOfLines={2} style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function formatPackageType(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function statusMessage(status: CourierDelivery["status"]) {
  switch (status) {
    case "REQUESTED": return "We have your request and are preparing it for courier matching.";
    case "MATCHING": return "We’re finding an eligible courier for this delivery.";
    case "ASSIGNED": return "A courier has been assigned and can begin heading to pickup.";
    case "COURIER_TO_PICKUP": return "Your courier is heading to the pickup location.";
    case "PICKED_UP": return "The package has been collected from pickup.";
    case "IN_TRANSIT": return "Your package is moving toward the delivery destination.";
    case "ARRIVING": return "The courier is close to the drop-off point.";
    case "DELIVERED": return "Delivery completed.";
    case "CANCELLED": return "This delivery was cancelled.";
    case "FAILED": return "This delivery needs attention from support.";
  }
}

const styles = StyleSheet.create({
  hero: { gap: 8 },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  statusPill: { borderRadius: v2Theme.radius.pill, backgroundColor: v2Theme.colors.brandSoft, paddingHorizontal: 9, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: v2Theme.colors.brand },
  statusText: { color: v2Theme.colors.brandStrong, fontSize: 10, fontWeight: "900", textTransform: "capitalize" },
  reference: { color: v2Theme.colors.inkTertiary, fontSize: 10, fontWeight: "900", letterSpacing: 0.7 },
  title: { color: v2Theme.colors.ink, fontSize: 28, lineHeight: 33, fontWeight: "900", letterSpacing: -0.8 },
  body: { color: v2Theme.colors.inkSecondary, fontSize: 14, lineHeight: 21 },
  routeCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, overflow: "hidden" },
  routeRow: { minHeight: 78, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", gap: 12 },
  routeIcon: { width: 42, height: 42, borderRadius: 15, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  routeIconBrand: { backgroundColor: v2Theme.colors.brandSoft },
  routeCopy: { flex: 1, gap: 3 },
  routeLabel: { color: v2Theme.colors.inkSecondary, fontSize: 10, fontWeight: "900" },
  routeValue: { color: v2Theme.colors.ink, fontSize: 13, lineHeight: 18, fontWeight: "900" },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: v2Theme.colors.line, marginLeft: 69 },
  detailsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  detailCard: { width: "48%", minHeight: 104, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surfaceMuted, padding: 13, gap: 6 },
  detailLabel: { color: v2Theme.colors.inkSecondary, fontSize: 10, fontWeight: "800" },
  detailValue: { color: v2Theme.colors.ink, fontSize: 13, lineHeight: 18, fontWeight: "900" },
  trackingCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.brandSofter, padding: 15, flexDirection: "row", gap: 12 },
  trackingIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" },
  trackingTitle: { color: v2Theme.colors.ink, fontSize: 14, fontWeight: "900" },
  stateCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surfaceMuted, padding: 18 },
  stateCopy: { flex: 1, gap: 4 },
  stateTitle: { color: v2Theme.colors.ink, fontSize: 14, fontWeight: "900" },
  stateBody: { color: v2Theme.colors.inkSecondary, fontSize: 11, lineHeight: 17 },
  errorCard: { borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.dangerSoft, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  errorTitle: { color: v2Theme.colors.danger, fontSize: 13, fontWeight: "900" },
  retry: { color: v2Theme.colors.danger, fontSize: 12, fontWeight: "900" },
});
