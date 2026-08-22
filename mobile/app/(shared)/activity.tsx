import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";

import { ErrorState } from "../../components/states/ErrorState";
import { LoadingState } from "../../components/states/LoadingState";
import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";
import { useTrips } from "../../hooks/useTrips";
import { listMyCourierDeliveries } from "../../services/courierService";
import { listMyFoodOrders } from "../../services/foodService";
import { CourierDelivery } from "../../types/courier.types";
import { FoodOrder } from "../../types/food.types";
import { RideRequest } from "../../types/ride.types";

type Filter = "all" | "rides" | "food" | "courier";
type TimelineItem =
  | { kind: "ride"; id: string; createdAt: string; trip: RideRequest }
  | { kind: "food"; id: string; createdAt: string; order: FoodOrder }
  | { kind: "courier"; id: string; createdAt: string; delivery: CourierDelivery };

export default function ActivityScreen() {
  const router = useRouter();
  const { trips, loading: ridesLoading, error: ridesError, reload: reloadRides } = useTrips();
  const [foodOrders, setFoodOrders] = useState<FoodOrder[]>([]);
  const [courierDeliveries, setCourierDeliveries] = useState<CourierDelivery[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const loadServices = useCallback(async () => {
    try {
      setServicesError(null);
      const [orders, deliveries] = await Promise.all([
        listMyFoodOrders(),
        listMyCourierDeliveries(),
      ]);
      setFoodOrders(orders);
      setCourierDeliveries(deliveries);
    } catch (err) {
      setServicesError(err instanceof Error ? err.message : "Unable to load delivery activity.");
    } finally {
      setServicesLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    loadServices();
  }, [loadServices]));

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [
      ...trips.map((trip) => ({ kind: "ride" as const, id: `ride-${trip.id}`, createdAt: trip.created_at || trip.ride_snapshot?.created_at || "", trip })),
      ...foodOrders.map((order) => ({ kind: "food" as const, id: `food-${order.id}`, createdAt: order.created_at || "", order })),
      ...courierDeliveries.map((delivery) => ({ kind: "courier" as const, id: `courier-${delivery.id}`, createdAt: delivery.created_at || "", delivery })),
    ];

    return items
      .filter((item) => filter === "all" || (filter === "rides" && item.kind === "ride") || (filter === "food" && item.kind === "food") || (filter === "courier" && item.kind === "courier"))
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }, [trips, foodOrders, courierDeliveries, filter]);

  const loading = ridesLoading || servicesLoading;
  const error = ridesError || servicesError;

  async function retry() {
    await Promise.all([reloadRides(), loadServices()]);
  }

  return (
    <Screen navRole="passenger">
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>YOUR LETSGORIDE</Text>
        <Text style={styles.title}>Activity</Text>
        <Text style={styles.body}>Every ride, food order and courier delivery in one clean timeline.</Text>
      </View>

      <View style={styles.filters}>
        <FilterButton label="All" active={filter === "all"} onPress={() => setFilter("all")} />
        <FilterButton label="Rides" active={filter === "rides"} onPress={() => setFilter("rides")} />
        <FilterButton label="Food" active={filter === "food"} onPress={() => setFilter("food")} />
        <FilterButton label="Courier" active={filter === "courier"} onPress={() => setFilter("courier")} />
      </View>

      {loading ? <LoadingState label="Loading activity..." /> : null}
      {error ? <ErrorState message={error} onRetry={retry} /> : null}

      {!loading && !error && timeline.length === 0 ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <MaterialCommunityIcons name="history" size={29} color={v2Theme.colors.brandStrong} />
          </View>
          <Text style={styles.emptyTitle}>Nothing here yet</Text>
          <Text style={styles.emptyBody}>Your LetsGoRide activity will appear here as soon as you reserve a ride, order food or send a delivery.</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push("/(shared)/services" as never)} hitSlop={8}>
            <Text style={styles.action}>Explore services</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.list}>
        {!loading && !error ? timeline.map((item) => {
          if (item.kind === "ride") {
            return <RideActivityCard key={item.id} trip={item.trip} onPress={() => router.push(`/(passenger)/ride/${item.trip.ride_id}` as never)} />;
          }
          if (item.kind === "food") {
            return <FoodActivityCard key={item.id} order={item.order} onPress={() => router.push(`/(shared)/food/order/${item.order.id}` as never)} />;
          }
          return <CourierActivityCard key={item.id} delivery={item.delivery} onPress={() => router.push(`/(shared)/courier/${item.delivery.id}` as never)} />;
        }) : null}
      </View>
    </Screen>
  );
}

function FilterButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.filterButton, active && styles.filterButtonActive]}>
      <Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text>
    </Pressable>
  );
}

function RideActivityCard({ trip, onPress }: { trip: RideRequest; onPress: () => void }) {
  const ride = trip.ride_snapshot;
  const title = ride ? `${ride.origin} → ${ride.destination}` : "Ride details";
  const subtitle = ride ? [ride.date, ride.time].filter(Boolean).join(" · ") : "Open trip for details";
  return (
    <ActivityCard
      icon="car-outline"
      iconTone="neutral"
      service="RIDE"
      title={title}
      subtitle={subtitle}
      status={friendlyStatus(trip.status)}
      trailing={ride?.price_usd != null ? `$${ride.price_usd.toFixed(2)}` : undefined}
      onPress={onPress}
    />
  );
}

function FoodActivityCard({ order, onPress }: { order: FoodOrder; onPress: () => void }) {
  const total = order.total_usd ?? order.subtotal_usd;
  return (
    <ActivityCard
      icon="silverware-fork-knife"
      iconTone="brand"
      service="FOOD"
      title={order.restaurant_name || "Food order"}
      subtitle={`${order.items.reduce((sum, item) => sum + item.quantity, 0)} items · ${formatDate(order.created_at)}`}
      status={friendlyStatus(order.status)}
      trailing={`$${total.toFixed(2)}`}
      onPress={onPress}
    />
  );
}

function CourierActivityCard({ delivery, onPress }: { delivery: CourierDelivery; onPress: () => void }) {
  return (
    <ActivityCard
      icon="package-variant-closed"
      iconTone="brand"
      service="COURIER"
      title={`${delivery.pickup_address} → ${delivery.dropoff_address}`}
      subtitle={`${delivery.package_type.replaceAll("_", " ")} · ${formatDate(delivery.created_at)}`}
      status={friendlyStatus(delivery.status)}
      trailing={delivery.price_usd != null ? `$${delivery.price_usd.toFixed(2)}` : undefined}
      onPress={onPress}
    />
  );
}

function ActivityCard({
  icon,
  iconTone,
  service,
  title,
  subtitle,
  status,
  trailing,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  iconTone: "neutral" | "brand";
  service: string;
  title: string;
  subtitle: string;
  status: string;
  trailing?: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.activityCard, pressed && styles.pressed]}>
      <View style={[styles.activityIcon, iconTone === "brand" && styles.activityIconBrand]}>
        <MaterialCommunityIcons name={icon} size={23} color={iconTone === "brand" ? v2Theme.colors.brandStrong : v2Theme.colors.ink} />
      </View>
      <View style={styles.cardCopy}>
        <View style={styles.cardEyebrowRow}>
          <Text style={styles.serviceLabel}>{service}</Text>
          <View style={styles.statusDot} />
          <Text numberOfLines={1} style={styles.statusText}>{status}</Text>
        </View>
        <Text numberOfLines={2} style={styles.cardTitle}>{title}</Text>
        <Text numberOfLines={1} style={styles.cardSubtitle}>{subtitle}</Text>
      </View>
      <View style={styles.cardRight}>
        {trailing ? <Text style={styles.trailing}>{trailing}</Text> : null}
        <MaterialCommunityIcons name="chevron-right" size={22} color={v2Theme.colors.inkTertiary} />
      </View>
    </Pressable>
  );
}

function friendlyStatus(status: string) {
  return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value?: string) {
  if (!value) return "Recent";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

const styles = StyleSheet.create({
  hero: { gap: 6 },
  eyebrow: { color: v2Theme.colors.brandStrong, fontSize: 11, fontWeight: "900", letterSpacing: 1.25 },
  title: { color: v2Theme.colors.ink, fontSize: v2Theme.type.display, fontWeight: "900", letterSpacing: -1.1 },
  body: { color: v2Theme.colors.inkSecondary, fontSize: 14, lineHeight: 21 },
  filters: { flexDirection: "row", gap: 6 },
  filterButton: { flex: 1, minHeight: 42, borderRadius: 14, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  filterButtonActive: { backgroundColor: v2Theme.colors.ink },
  filterText: { color: v2Theme.colors.inkSecondary, fontSize: 10, fontWeight: "900" },
  filterTextActive: { color: "#FFFFFF" },
  list: { gap: 10 },
  activityCard: { minHeight: 94, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  activityIcon: { width: 50, height: 50, borderRadius: 17, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  activityIconBrand: { backgroundColor: v2Theme.colors.brandSoft },
  cardCopy: { flex: 1, gap: 4 },
  cardEyebrowRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  serviceLabel: { color: v2Theme.colors.brandStrong, fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  statusDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: v2Theme.colors.inkTertiary },
  statusText: { flexShrink: 1, color: v2Theme.colors.inkSecondary, fontSize: 9, fontWeight: "800" },
  cardTitle: { color: v2Theme.colors.ink, fontSize: 14, lineHeight: 19, fontWeight: "900", letterSpacing: -0.15 },
  cardSubtitle: { color: v2Theme.colors.inkSecondary, fontSize: 10 },
  cardRight: { minWidth: 48, alignItems: "flex-end", gap: 8 },
  trailing: { color: v2Theme.colors.ink, fontSize: 11, fontWeight: "900" },
  emptyCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.brandSofter, padding: 20, gap: 9 },
  emptyIcon: { width: 52, height: 52, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: v2Theme.colors.brandSoft },
  emptyTitle: { color: v2Theme.colors.ink, fontSize: 18, fontWeight: "900" },
  emptyBody: { color: v2Theme.colors.inkSecondary, fontSize: 13, lineHeight: 20 },
  action: { color: v2Theme.colors.brandStrong, fontSize: 13, fontWeight: "900", paddingTop: 3 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
});
