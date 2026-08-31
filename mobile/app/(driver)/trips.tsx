import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { EmptyState } from "../../components/states/EmptyState";
import { ErrorState } from "../../components/states/ErrorState";
import { LoadingState } from "../../components/states/LoadingState";
import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";
import { useDriverRides } from "../../hooks/useDriverRides";
import { Ride } from "../../types/ride.types";
import { formatStatus } from "../../utils/formatStatus";

const TERMINAL_STATUSES = new Set(["COMPLETED", "CANCELLED", "EXPIRED", "completed", "cancelled", "expired"]);

export default function DriverTripsScreen() {
  const router = useRouter();
  const { rides: ownRides, loading, error, reload } = useDriverRides();
  const active = ownRides.filter((ride) => !TERMINAL_STATUSES.has(String(ride.status)));
  const history = ownRides.filter((ride) => TERMINAL_STATUSES.has(String(ride.status)));

  return (
    <Screen title="Trips" navRole="driver">
      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>YOUR ROAD</Text>
          <Text style={styles.title}>Routes you’re driving.</Text>
          <Text style={styles.body}>Upcoming intercity trips and passenger-ready routes, without the dashboard clutter.</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Post trip"
          onPress={() => router.push("/(driver)/post-trip" as never)}
          style={({ pressed }) => [styles.postButton, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="plus" size={20} color="#FFFFFF" />
          <Text style={styles.postButtonText}>Post trip</Text>
        </Pressable>
      </View>

      {loading ? <LoadingState label="Loading trips..." /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {!loading && !error && ownRides.length === 0 ? (
        <EmptyState
          title="No driver trips"
          body="Post a trip to start accepting passenger seat requests."
          icon="car-outline"
          actionLabel="Post trip"
          onAction={() => router.replace("/(driver)/post-trip" as never)}
        />
      ) : null}

      {!loading && !error && active.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Upcoming</Text>
              <Text style={styles.sectionSub}>Your active driving plan</Text>
            </View>
            <Text style={styles.count}>{active.length}</Text>
          </View>
          <View style={styles.routeList}>
            {active.map((ride) => (
              <DriverRouteCard
                key={ride.id}
                ride={ride}
                onPress={() => router.push(`/(driver)/trip/${ride.id}` as never)}
              />
            ))}
          </View>
        </View>
      ) : null}

      {!loading && !error && history.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Past routes</Text>
              <Text style={styles.sectionSub}>Completed and closed trips</Text>
            </View>
            <Text style={styles.countMuted}>{history.length}</Text>
          </View>
          <View style={styles.routeList}>
            {history.map((ride) => (
              <DriverRouteCard
                key={ride.id}
                ride={ride}
                muted
                onPress={() => router.push(`/(driver)/trip/${ride.id}` as never)}
              />
            ))}
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

function DriverRouteCard({ ride, onPress, muted = false }: { ride: Ride; onPress: () => void; muted?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${ride.origin} to ${ride.destination}`}
      onPress={onPress}
      style={({ pressed }) => [styles.routeCard, muted && styles.routeCardMuted, pressed && styles.pressed]}
    >
      <View style={styles.routeRail}>
        <View style={styles.originDot} />
        <View style={styles.routeLine} />
        <View style={styles.destinationDot} />
      </View>
      <View style={styles.routeCopy}>
        <Text numberOfLines={1} style={styles.routePlace}>{ride.origin}</Text>
        <Text style={styles.routeMeta}>{ride.date} · {ride.time}</Text>
        <Text numberOfLines={1} style={styles.routePlace}>{ride.destination}</Text>
        <View style={styles.detailRow}>
          <View style={styles.detailChip}>
            <MaterialCommunityIcons name="seat-passenger" size={14} color={v2Theme.colors.inkSecondary} />
            <Text style={styles.detailText}>{ride.available_seats} {ride.available_seats === 1 ? "seat" : "seats"}</Text>
          </View>
          <Text style={styles.statusText}>{formatStatus(String(ride.status))}</Text>
        </View>
      </View>
      <View style={styles.routeRight}>
        <Text style={styles.price}>${ride.price_usd.toFixed(2)}</Text>
        <Text style={styles.priceLabel}>per seat</Text>
        <View style={styles.chevron}>
          <MaterialCommunityIcons name="chevron-right" size={20} color={v2Theme.colors.ink} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 15, paddingBottom: 4 },
  heroCopy: { gap: 5 },
  eyebrow: { color: v2Theme.colors.brandStrong, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: v2Theme.colors.ink, fontSize: 31, lineHeight: 35, fontWeight: "900", letterSpacing: -1 },
  body: { color: v2Theme.colors.inkSecondary, fontSize: 12, lineHeight: 18, maxWidth: 330 },
  postButton: { alignSelf: "flex-start", minHeight: 46, paddingHorizontal: 16, borderRadius: 23, backgroundColor: v2Theme.colors.ink, flexDirection: "row", alignItems: "center", gap: 7 },
  postButtonText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  section: { gap: 10 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: v2Theme.colors.ink, fontSize: 19, fontWeight: "900", letterSpacing: -0.35 },
  sectionSub: { color: v2Theme.colors.inkSecondary, fontSize: 9, marginTop: 2 },
  count: { minWidth: 31, minHeight: 31, paddingHorizontal: 8, borderRadius: 16, overflow: "hidden", textAlign: "center", textAlignVertical: "center", paddingVertical: 7, backgroundColor: v2Theme.colors.brandSoft, color: v2Theme.colors.brandStrong, fontSize: 10, fontWeight: "900" },
  countMuted: { minWidth: 31, minHeight: 31, paddingHorizontal: 8, borderRadius: 16, overflow: "hidden", textAlign: "center", paddingVertical: 7, backgroundColor: v2Theme.colors.surfaceMuted, color: v2Theme.colors.inkSecondary, fontSize: 10, fontWeight: "900" },
  routeList: { gap: 9 },
  routeCard: { minHeight: 128, borderRadius: 25, padding: 14, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, flexDirection: "row", gap: 12, shadowColor: v2Theme.colors.shadow, shadowOpacity: 0.045, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  routeCardMuted: { opacity: 0.72, shadowOpacity: 0 },
  routeRail: { width: 18, alignItems: "center", paddingVertical: 7 },
  originDot: { width: 11, height: 11, borderRadius: 6, borderWidth: 3, borderColor: v2Theme.colors.ink, backgroundColor: "#FFFFFF" },
  routeLine: { width: 2, flex: 1, minHeight: 34, marginVertical: 4, backgroundColor: v2Theme.colors.lineStrong },
  destinationDot: { width: 10, height: 10, borderRadius: 3, backgroundColor: v2Theme.colors.ink },
  routeCopy: { flex: 1, gap: 3 },
  routePlace: { color: v2Theme.colors.ink, fontSize: 15, lineHeight: 19, fontWeight: "900", letterSpacing: -0.25 },
  routeMeta: { color: v2Theme.colors.brandStrong, fontSize: 9, fontWeight: "900", marginBottom: 8 },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" },
  detailChip: { minHeight: 28, borderRadius: 14, paddingHorizontal: 9, backgroundColor: v2Theme.colors.surfaceMuted, flexDirection: "row", alignItems: "center", gap: 5 },
  detailText: { color: v2Theme.colors.inkSecondary, fontSize: 8, fontWeight: "800" },
  statusText: { color: v2Theme.colors.inkSecondary, fontSize: 8, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.55 },
  routeRight: { alignItems: "flex-end", justifyContent: "space-between", paddingVertical: 2 },
  price: { color: v2Theme.colors.ink, fontSize: 16, fontWeight: "900" },
  priceLabel: { color: v2Theme.colors.inkTertiary, fontSize: 8, marginTop: -6 },
  chevron: { width: 34, height: 34, borderRadius: 12, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.75, transform: [{ scale: 0.995 }] },
});
