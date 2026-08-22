import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";

import { ErrorState } from "../../components/states/ErrorState";
import { LoadingState } from "../../components/states/LoadingState";
import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";
import { useTrips } from "../../hooks/useTrips";
import { RideRequest } from "../../types/ride.types";

export default function ActivityScreen() {
  const router = useRouter();
  const { trips, loading, error, reload } = useTrips();
  const [filter, setFilter] = useState<"upcoming" | "past">("upcoming");

  const visibleTrips = useMemo(
    () => trips.filter((trip) => (filter === "upcoming" ? isUpcoming(trip) : !isUpcoming(trip))),
    [filter, trips],
  );

  return (
    <Screen navRole="passenger">
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>YOUR LETSGORIDE</Text>
        <Text style={styles.title}>Activity</Text>
        <Text style={styles.body}>Rides live here now. Food orders and courier deliveries will join the same timeline.</Text>
      </View>

      <View style={styles.segmented}>
        <FilterButton label="Upcoming" active={filter === "upcoming"} onPress={() => setFilter("upcoming")} />
        <FilterButton label="Past" active={filter === "past"} onPress={() => setFilter("past")} />
      </View>

      {loading ? <LoadingState label="Loading activity..." /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}

      {!loading && !error && visibleTrips.length === 0 ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <MaterialCommunityIcons name="calendar-blank-outline" size={28} color={v2Theme.colors.brandStrong} />
          </View>
          <Text style={styles.emptyTitle}>{filter === "upcoming" ? "No upcoming activity" : "No past activity yet"}</Text>
          <Text style={styles.emptyBody}>
            {filter === "upcoming"
              ? "When you reserve a ride, it will appear here with its status and trip details."
              : "Completed and cancelled activity will be kept here for easy reference."}
          </Text>
          {filter === "upcoming" ? (
            <Pressable onPress={() => router.push("/(passenger)/search" as never)} hitSlop={8}>
              <Text style={styles.action}>Find a ride</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.list}>
        {!loading && !error
          ? visibleTrips.map((trip) => (
              <ActivityCard
                key={trip.id}
                trip={trip}
                onPress={() => router.push(`/(passenger)/ride/${trip.ride_id}` as never)}
              />
            ))
          : null}
      </View>
    </Screen>
  );
}

function FilterButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.segmentButton, active && styles.segmentButtonActive]}
    >
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
    </Pressable>
  );
}

function ActivityCard({ trip, onPress }: { trip: RideRequest; onPress: () => void }) {
  const ride = trip.ride_snapshot;
  const route = ride ? `${ride.origin} → ${ride.destination}` : "Ride details";
  const schedule = ride ? [ride.date, ride.time].filter(Boolean).join(" · ") : "Open trip for details";
  const vehicle = ride?.vehicle?.trim();
  const status = friendlyStatus(trip.status);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.activityCard, pressed && styles.pressed]}>
      <View style={styles.cardTopRow}>
        <View style={styles.activityIcon}>
          <MaterialCommunityIcons name="car-outline" size={23} color={v2Theme.colors.ink} />
        </View>
        <View style={styles.routeCopy}>
          <Text numberOfLines={2} style={styles.route}>{route}</Text>
          <Text style={styles.schedule}>{schedule}</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={23} color={v2Theme.colors.inkTertiary} />
      </View>

      <View style={styles.metaRow}>
        <View style={styles.statusPill}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>{status}</Text>
        </View>
        <Text style={styles.metaText}>{trip.seats} {trip.seats === 1 ? "seat" : "seats"}</Text>
        {vehicle ? <Text numberOfLines={1} style={[styles.metaText, styles.vehicle]}>{vehicle}</Text> : null}
      </View>
    </Pressable>
  );
}

function isUpcoming(trip: RideRequest) {
  if (["cancelled", "cancelled_by_passenger", "cancelled_by_driver", "cancelled_by_admin", "declined"].includes(trip.status)) {
    return false;
  }
  const rideStatus = trip.ride_snapshot?.status;
  return !["COMPLETED", "CANCELLED", "EXPIRED", "completed", "cancelled"].includes(String(rideStatus));
}

function friendlyStatus(status: RideRequest["status"]) {
  return status
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const styles = StyleSheet.create({
  hero: { gap: 6 },
  eyebrow: {
    color: v2Theme.colors.brandStrong,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.25,
  },
  title: {
    color: v2Theme.colors.ink,
    fontSize: v2Theme.type.display,
    fontWeight: "900",
    letterSpacing: -1.1,
  },
  body: {
    color: v2Theme.colors.inkSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  segmented: {
    minHeight: 50,
    borderRadius: v2Theme.radius.lg,
    padding: 4,
    backgroundColor: v2Theme.colors.surfaceMuted,
    flexDirection: "row",
    gap: 4,
  },
  segmentButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentButtonActive: {
    backgroundColor: v2Theme.colors.surface,
    shadowColor: v2Theme.colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  segmentText: {
    color: v2Theme.colors.inkSecondary,
    fontSize: 13,
    fontWeight: "800",
  },
  segmentTextActive: {
    color: v2Theme.colors.ink,
    fontWeight: "900",
  },
  list: { gap: 10 },
  activityCard: {
    borderRadius: v2Theme.radius.xl,
    backgroundColor: v2Theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: v2Theme.colors.line,
    padding: 15,
    gap: 14,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  activityIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: v2Theme.colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  routeCopy: { flex: 1, gap: 4 },
  route: {
    color: v2Theme.colors.ink,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "900",
    letterSpacing: -0.25,
  },
  schedule: {
    color: v2Theme.colors.inkSecondary,
    fontSize: 12,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingLeft: 58,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: v2Theme.radius.pill,
    backgroundColor: v2Theme.colors.brandSoft,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: v2Theme.colors.brand,
  },
  statusText: {
    color: v2Theme.colors.brandStrong,
    fontSize: 10,
    fontWeight: "900",
  },
  metaText: {
    color: v2Theme.colors.inkSecondary,
    fontSize: 11,
    fontWeight: "700",
  },
  vehicle: { flex: 1 },
  emptyCard: {
    borderRadius: v2Theme.radius.xxl,
    backgroundColor: v2Theme.colors.brandSofter,
    padding: 20,
    gap: 9,
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: v2Theme.colors.brandSoft,
  },
  emptyTitle: {
    color: v2Theme.colors.ink,
    fontSize: 18,
    fontWeight: "900",
  },
  emptyBody: {
    color: v2Theme.colors.inkSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
  action: {
    color: v2Theme.colors.brandStrong,
    fontSize: 13,
    fontWeight: "900",
    paddingTop: 3,
  },
  pressed: { opacity: 0.72 },
});
