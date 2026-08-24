import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";

import { ErrorState } from "../../components/states/ErrorState";
import { LoadingState } from "../../components/states/LoadingState";
import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";
import { useLiveRefresh } from "../../hooks/useLiveRefresh";
import { hasSession } from "../../services/authService";
import { listMyCourierDeliveries } from "../../services/courierService";
import { listMyFoodOrders } from "../../services/foodService";
import { myRideRequests } from "../../services/ridesService";
import { CourierDelivery } from "../../types/courier.types";
import { FoodOrder } from "../../types/food.types";
import { RideRequest } from "../../types/ride.types";
import { displayPlace } from "../../utils/displayText";

type Filter = "all" | "rides" | "food" | "courier";
type TimelineItem =
  | { kind: "ride"; id: string; createdAt: string; trip: RideRequest }
  | { kind: "food"; id: string; createdAt: string; order: FoodOrder }
  | { kind: "courier"; id: string; createdAt: string; delivery: CourierDelivery };

const FOOD_TERMINAL = new Set(["DELIVERED", "CANCELLED", "REJECTED"]);
const COURIER_TERMINAL = new Set(["DELIVERED", "CANCELLED", "FAILED"]);
const RIDE_TERMINAL = new Set(["COMPLETED", "CANCELLED", "EXPIRED", "completed", "cancelled", "closed"]);

export default function ActivityScreen() {
  const router = useRouter();
  const [trips, setTrips] = useState<RideRequest[]>([]);
  const [foodOrders, setFoodOrders] = useState<FoodOrder[]>([]);
  const [courierDeliveries, setCourierDeliveries] = useState<CourierDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [guest, setGuest] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    try {
      const signedIn = await hasSession();
      if (!signedIn) {
        setGuest(true);
        setTrips([]);
        setFoodOrders([]);
        setCourierDeliveries([]);
        setError(null);
        return;
      }

      setGuest(false);
      const [rides, orders, deliveries] = await Promise.all([
        myRideRequests(),
        listMyFoodOrders(),
        listMyCourierDeliveries(),
      ]);
      setTrips(rides);
      setFoodOrders(orders);
      setCourierDeliveries(deliveries);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your activity could not be loaded.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const allItems = useMemo<TimelineItem[]>(() => [
    ...trips.map((trip) => ({ kind: "ride" as const, id: `ride-${trip.id}`, createdAt: trip.created_at || trip.ride_snapshot?.created_at || "", trip })),
    ...foodOrders.map((order) => ({ kind: "food" as const, id: `food-${order.id}`, createdAt: order.created_at || "", order })),
    ...courierDeliveries.map((delivery) => ({ kind: "courier" as const, id: `courier-${delivery.id}`, createdAt: delivery.created_at || "", delivery })),
  ], [trips, foodOrders, courierDeliveries]);

  const timeline = useMemo(() => allItems
    .filter((item) => filter === "all" || (filter === "rides" && item.kind === "ride") || (filter === "food" && item.kind === "food") || (filter === "courier" && item.kind === "courier"))
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()), [allItems, filter]);
  const inProgress = timeline.filter(isActive);
  const history = timeline.filter((item) => !isActive(item));
  const hasActive = allItems.some(isActive);

  // Guest refresh only rechecks the local session boundary. Private endpoints
  // are called after authentication, including when this screen regains focus.
  useLiveRefresh(load, hasActive ? 15000 : 60000);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  return (
    <Screen navRole="customer" refreshing={refreshing} onRefresh={guest ? undefined : onRefresh}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>YOUR ACTIVITY</Text>
        <Text style={styles.title}>{guest ? "Your activity lives here" : "Activity"}</Text>
        <Text style={styles.body}>{guest ? "Sign in to see your rides, food orders and deliveries together." : "Live journeys first, followed by a clean history of everything you’ve booked."}</Text>
      </View>

      {loading ? <LoadingState label="Loading activity..." /> : null}

      {!loading && guest ? (
        <View style={styles.guestCard}>
          <View style={styles.guestIcon}><MaterialCommunityIcons name="history" size={30} color={v2Theme.colors.brandStrong} /></View>
          <Text style={styles.emptyTitle}>Keep every journey in reach</Text>
          <Text style={styles.emptyBody}>Browse freely. When you’re ready to book, sign in or create an account.</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push("/(auth)/email-login" as never)} style={styles.primaryAction}><Text style={styles.primaryActionText}>Sign in</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push("/(auth)/email-register" as never)} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>Create account</Text></Pressable>
        </View>
      ) : null}

      {!loading && !guest ? (
        <>
          <View style={styles.filters}>
            <FilterButton label="All" active={filter === "all"} onPress={() => setFilter("all")} />
            <FilterButton label="Rides" active={filter === "rides"} onPress={() => setFilter("rides")} />
            <FilterButton label="Food" active={filter === "food"} onPress={() => setFilter("food")} />
            <FilterButton label="Courier" active={filter === "courier"} onPress={() => setFilter("courier")} />
          </View>
          {error ? <ErrorState message={error} onRetry={load} /> : null}
          {!error && timeline.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}><MaterialCommunityIcons name="compass-outline" size={29} color={v2Theme.colors.brandStrong} /></View>
              <Text style={styles.emptyTitle}>Nothing here yet</Text>
              <Text style={styles.emptyBody}>Your first ride, food order or courier delivery will appear here.</Text>
              <Pressable accessibilityRole="button" onPress={() => router.push("/(shared)/services" as never)} hitSlop={8}><Text style={styles.action}>Explore services</Text></Pressable>
            </View>
          ) : null}
          {!error && inProgress.length ? <ActivitySection title="In progress" items={inProgress} router={router} live /> : null}
          {!error && history.length ? <ActivitySection title="History" items={history} router={router} /> : null}
        </>
      ) : null}
    </Screen>
  );
}

function ActivitySection({ title, items, router, live = false }: { title: string; items: TimelineItem[]; router: ReturnType<typeof useRouter>; live?: boolean }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>{title}</Text>{live ? <View style={styles.livePill}><View style={styles.liveDot} /><Text style={styles.liveText}>LIVE</Text></View> : null}</View>
      <View style={styles.list}>
        {items.map((item) => {
          if (item.kind === "ride") return <RideActivityCard key={item.id} trip={item.trip} onPress={() => router.push(`/(customer)/ride/${item.trip.ride_id}` as never)} />;
          if (item.kind === "food") return <FoodActivityCard key={item.id} order={item.order} onPress={() => router.push(`/(shared)/food/order/${item.order.id}` as never)} />;
          return <CourierActivityCard key={item.id} delivery={item.delivery} onPress={() => router.push(`/(customer)/courier/${item.delivery.id}` as never)} />;
        })}
      </View>
    </View>
  );
}

function isActive(item: TimelineItem) {
  if (item.kind === "food") return !FOOD_TERMINAL.has(item.order.status);
  if (item.kind === "courier") return !COURIER_TERMINAL.has(item.delivery.status);
  const ride = item.trip.ride_snapshot;
  return item.trip.status === "pending" || (item.trip.status === "confirmed" && !RIDE_TERMINAL.has(ride?.status || ""));
}

function FilterButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) { return <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.filterButton, active && styles.filterButtonActive]}><Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text></Pressable>; }
function RideActivityCard({ trip, onPress }: { trip: RideRequest; onPress: () => void }) { const ride = trip.ride_snapshot; return <ActivityCard icon="car-outline" iconTone="neutral" service="RIDE" title={ride ? `${displayPlace(ride.origin)} → ${displayPlace(ride.destination)}` : "Ride details"} subtitle={ride ? [formatRideDate(ride.date), ride.time].filter(Boolean).join(" · ") : "Open ride for details"} status={friendlyStatus(ride?.status || trip.status)} trailing={ride?.price_usd != null ? `$${ride.price_usd.toFixed(2)}` : undefined} onPress={onPress} />; }
function FoodActivityCard({ order, onPress }: { order: FoodOrder; onPress: () => void }) { const total = order.total_usd ?? order.subtotal_usd; return <ActivityCard icon="silverware-fork-knife" iconTone="brand" service="FOOD" title={order.restaurant_name || "Food order"} subtitle={`${order.items.reduce((sum, item) => sum + item.quantity, 0)} items · ${formatDate(order.created_at)}`} status={friendlyStatus(order.status)} trailing={`$${total.toFixed(2)}`} onPress={onPress} />; }
function CourierActivityCard({ delivery, onPress }: { delivery: CourierDelivery; onPress: () => void }) { return <ActivityCard icon="package-variant-closed" iconTone="brand" service="COURIER" title={`${displayPlace(delivery.pickup_address)} → ${displayPlace(delivery.dropoff_address)}`} subtitle={`${friendlyStatus(delivery.package_type)} · ${formatDate(delivery.created_at)}`} status={friendlyStatus(delivery.status)} trailing={delivery.price_usd != null ? `$${delivery.price_usd.toFixed(2)}` : undefined} onPress={onPress} />; }
function ActivityCard({ icon, iconTone, service, title, subtitle, status, trailing, onPress }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; iconTone: "neutral" | "brand"; service: string; title: string; subtitle: string; status: string; trailing?: string; onPress: () => void; }) { return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.activityCard, pressed && styles.pressed]}><View style={[styles.activityIcon, iconTone === "brand" && styles.activityIconBrand]}><MaterialCommunityIcons name={icon} size={23} color={iconTone === "brand" ? v2Theme.colors.brandStrong : v2Theme.colors.ink} /></View><View style={styles.cardCopy}><View style={styles.cardEyebrowRow}><Text style={styles.serviceLabel}>{service}</Text><View style={styles.statusDot} /><Text numberOfLines={1} style={styles.statusText}>{status}</Text></View><Text numberOfLines={2} style={styles.cardTitle}>{title}</Text><Text numberOfLines={1} style={styles.cardSubtitle}>{subtitle}</Text></View><View style={styles.cardRight}>{trailing ? <Text style={styles.trailing}>{trailing}</Text> : null}<MaterialCommunityIcons name="chevron-right" size={22} color={v2Theme.colors.inkTertiary} /></View></Pressable>; }
function friendlyStatus(status: string) { return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function formatDate(value?: string) { if (!value) return "Recent"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "Recent" : date.toLocaleDateString(undefined, { day: "numeric", month: "short" }); }
function formatRideDate(value?: string) { if (!value) return "Scheduled"; const date = new Date(`${value}T12:00:00`); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }); }

const styles = StyleSheet.create({
  hero: { gap: 6 }, eyebrow: { color: v2Theme.colors.brandStrong, fontSize: 11, fontWeight: "900", letterSpacing: 1.25 }, title: { color: v2Theme.colors.ink, fontSize: v2Theme.type.display, fontWeight: "900", letterSpacing: -1.1 }, body: { color: v2Theme.colors.inkSecondary, fontSize: 14, lineHeight: 21 },
  filters: { flexDirection: "row", gap: 6 }, filterButton: { flex: 1, minHeight: 42, borderRadius: 14, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" }, filterButtonActive: { backgroundColor: v2Theme.colors.ink }, filterText: { color: v2Theme.colors.inkSecondary, fontSize: 10, fontWeight: "900" }, filterTextActive: { color: "#FFFFFF" },
  section: { gap: 10 }, sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, sectionTitle: { color: v2Theme.colors.ink, fontSize: 20, fontWeight: "900", letterSpacing: -0.35 }, livePill: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 999, backgroundColor: v2Theme.colors.brandSoft, paddingHorizontal: 9, paddingVertical: 5 }, liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: v2Theme.colors.brand }, liveText: { color: v2Theme.colors.brandStrong, fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
  list: { gap: 10 }, activityCard: { minHeight: 94, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 13, flexDirection: "row", alignItems: "center", gap: 11 }, activityIcon: { width: 50, height: 50, borderRadius: 17, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" }, activityIconBrand: { backgroundColor: v2Theme.colors.brandSoft }, cardCopy: { flex: 1, gap: 4 }, cardEyebrowRow: { flexDirection: "row", alignItems: "center", gap: 5 }, serviceLabel: { color: v2Theme.colors.brandStrong, fontSize: 8, fontWeight: "900", letterSpacing: 0.8 }, statusDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: v2Theme.colors.inkTertiary }, statusText: { flexShrink: 1, color: v2Theme.colors.inkSecondary, fontSize: 9, fontWeight: "800" }, cardTitle: { color: v2Theme.colors.ink, fontSize: 14, lineHeight: 19, fontWeight: "900", letterSpacing: -0.15 }, cardSubtitle: { color: v2Theme.colors.inkSecondary, fontSize: 10 }, cardRight: { minWidth: 48, alignItems: "flex-end", gap: 8 }, trailing: { color: v2Theme.colors.ink, fontSize: 11, fontWeight: "900" },
  guestCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 20, gap: 11 }, guestIcon: { width: 56, height: 56, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: v2Theme.colors.brandSoft }, primaryAction: { minHeight: 52, borderRadius: 17, backgroundColor: v2Theme.colors.ink, alignItems: "center", justifyContent: "center", marginTop: 5 }, primaryActionText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" }, secondaryAction: { minHeight: 50, borderRadius: 17, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" }, secondaryActionText: { color: v2Theme.colors.ink, fontSize: 12, fontWeight: "900" },
  emptyCard: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.brandSofter, padding: 20, gap: 9 }, emptyIcon: { width: 52, height: 52, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: v2Theme.colors.brandSoft }, emptyTitle: { color: v2Theme.colors.ink, fontSize: 18, fontWeight: "900" }, emptyBody: { color: v2Theme.colors.inkSecondary, fontSize: 13, lineHeight: 20 }, action: { color: v2Theme.colors.brandStrong, fontSize: 13, fontWeight: "900", paddingTop: 3 }, pressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
});
