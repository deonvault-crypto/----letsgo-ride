import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { RideCard } from "../../components/cards/RideCard";
import { ServiceSwitcher, CustomerService } from "../../components/platform/ServiceSwitcher";
import { ServiceStoryCard } from "../../components/platform/ServiceStoryCard";
import { EmptyState } from "../../components/states/EmptyState";
import { AppNotice } from "../../components/ui/AppNotice";
import { PopularRouteChips } from "../../components/ui/PopularRouteChips";
import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";
import { useActiveHailingTrip, useHailingConfig } from "../../hooks/useHailing";
import { useRides } from "../../hooks/useRides";
import { isRideBookable } from "../../utils/tripLifecycle";

export default function CustomerHomeScreen() {
  const router = useRouter();
  const { rides, loading, refreshing, error, reload } = useRides();
  const { config: hailingConfig } = useHailingConfig();
  const { trip: activeHailingTrip } = useActiveHailingTrip(false);
  const upcomingRides = rides.filter((ride) => isRideBookable(ride));
  const hailingEnabled = hailingConfig?.enabled !== false;
  const activeHailing = activeHailingTrip && !["COMPLETED", "CANCELLED_BY_PASSENGER", "CANCELLED_BY_DRIVER", "CANCELLED_BY_ADMIN", "NO_DRIVER_FOUND"].includes(activeHailingTrip.status);

  function chooseService(service: CustomerService) {
    if (service === "ride") return;
    if (service === "food") return router.push("/(customer)/food" as never);
    router.push("/(shared)/courier" as never);
  }

  function openDriverProfile(driverId: string | undefined, rideId: string) {
    if (!driverId) return;
    router.push(`/(shared)/driver-profile/${driverId}?rideId=${rideId}` as never);
  }

  return (
    <Screen navRole="customer" refreshing={refreshing && !loading} onRefresh={reload}>
      <ServiceSwitcher value="ride" onChange={chooseService} />

      {hailingEnabled ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={activeHailing ? "Open active Ride Now trip" : "Request a Ride Now"}
          onPress={() => router.push(activeHailing ? `/(customer)/hail/trip/${activeHailingTrip.id}` as never : "/(customer)/hail" as never)}
          style={({ pressed }) => [styles.rideNowCard, pressed && styles.pressed]}
        >
          <View style={styles.rideNowIcon}>
            <MaterialCommunityIcons name={activeHailing ? "car-clock" : "magnify"} size={25} color={v2Theme.colors.brandStrong} />
          </View>
          <View style={styles.rideNowCopy}>
            <Text style={styles.rideNowEyebrow}>{activeHailing ? "ACTIVE RIDE" : "RIDE NOW"}</Text>
            <Text style={styles.rideNowTitle}>{activeHailing ? "Continue your ride" : "Where to?"}</Text>
            <Text numberOfLines={1} style={styles.rideNowBody}>
              {activeHailing ? activeHailingTrip.status.replaceAll("_", " ") : "Pickup → destination"}
            </Text>
          </View>
          <View style={styles.rideNowArrow}>
            <MaterialCommunityIcons name="arrow-right" size={21} color="#FFFFFF" />
          </View>
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Search intercity and scheduled rides"
        onPress={() => router.push("/(customer)/search" as never)}
        style={({ pressed }) => [styles.intercityCard, pressed && styles.pressed]}
      >
        <View style={styles.intercityIcon}>
          <MaterialCommunityIcons name="road-variant" size={21} color={v2Theme.colors.inkSecondary} />
        </View>
        <View style={styles.intercityCopy}>
          <Text style={styles.intercityTitle}>Intercity / Scheduled</Text>
          <Text style={styles.intercitySubtitle}>Routes, dates and available seats</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={21} color={v2Theme.colors.inkTertiary} />
      </Pressable>

      <View style={styles.section}>
        <View style={styles.sectionHeadingRow}>
          <Text style={styles.sectionTitle}>For you</Text>
          <Pressable onPress={() => router.push("/(shared)/services" as never)} hitSlop={8}>
            <Text style={styles.textAction}>See all</Text>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storyRail}>
          <ServiceStoryCard
            compact
            title="Ride Now"
            subtitle="Local private rides"
            eyebrow="GO"
            icon="car-arrow-right"
            image={require("../../assets/images/ride-harare-owned-v2.jpg")}
            onPress={() => router.push(hailingEnabled ? "/(customer)/hail" as never : "/(customer)/search" as never)}
          />
          <ServiceStoryCard
            compact
            title="Food"
            subtitle="Kitchens and dishes near you"
            eyebrow="EAT"
            icon="food-fork-drink"
            image={require("../../assets/images/food-marketplace-owned-v1.png")}
            onPress={() => router.push("/(customer)/food" as never)}
          />
          <ServiceStoryCard
            compact
            title="Courier"
            subtitle="Parcels with live tracking"
            eyebrow="SEND"
            icon="package-variant-closed"
            image={require("../../assets/images/courier-handoff-owned-v2.jpg")}
            onPress={() => router.push("/(shared)/courier" as never)}
          />
        </ScrollView>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Popular routes</Text>
        <PopularRouteChips onSelect={(origin, destination) => router.push({ pathname: "/(customer)/results", params: { origin, destination, seats: "1" } } as never)} />
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeadingRow}>
          <View style={styles.headingCopy}>
            <Text style={styles.sectionTitle}>Upcoming rides</Text>
            <Text style={styles.sectionCaption}>Verified trips available to reserve</Text>
          </View>
          <Pressable onPress={() => router.push("/(customer)/search" as never)} hitSlop={8}>
            <Text style={styles.textAction}>Search</Text>
          </Pressable>
        </View>
        {loading ? (
          <View testID="upcoming-rides-skeleton" style={styles.rideSkeleton}>
            <View style={styles.skeletonLineWide} />
            <View style={styles.skeletonLine} />
          </View>
        ) : null}
        {error ? <AppNotice message={error} actionLabel="Retry" onAction={reload} /> : null}
        {!loading && !error && upcomingRides.length === 0 ? (
          <EmptyState title="No rides nearby yet" body="New trips will appear here when drivers post them." icon="car-clock" />
        ) : null}
        {!loading && upcomingRides.slice(0, 3).map((ride) => (
          <RideCard
            key={ride.id}
            ride={ride}
            onPress={() => router.push(`/(customer)/ride/${ride.id}` as never)}
            onDriverPress={() => openDriverProfile(ride.driver_id, ride.id)}
          />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  rideNowCard: {
    minHeight: 94,
    borderRadius: 24,
    backgroundColor: v2Theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: v2Theme.colors.lineStrong,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rideNowIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: v2Theme.colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  rideNowCopy: {
    flex: 1,
    gap: 2,
  },
  rideNowEyebrow: {
    color: v2Theme.colors.brandStrong,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  rideNowTitle: {
    color: v2Theme.colors.ink,
    fontSize: 23,
    lineHeight: 27,
    fontWeight: "900",
    letterSpacing: -0.65,
  },
  rideNowBody: {
    color: v2Theme.colors.inkSecondary,
    fontSize: 11,
    lineHeight: 15,
  },
  rideNowArrow: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: v2Theme.colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  intercityCard: {
    minHeight: 68,
    borderRadius: 20,
    backgroundColor: v2Theme.colors.surfaceMuted,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  intercityIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: v2Theme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  intercityCopy: {
    flex: 1,
    gap: 2,
  },
  intercityTitle: {
    color: v2Theme.colors.ink,
    fontSize: 13,
    fontWeight: "900",
  },
  intercitySubtitle: {
    color: v2Theme.colors.inkSecondary,
    fontSize: 10,
    lineHeight: 14,
  },
  section: {
    gap: v2Theme.spacing.md,
  },
  sectionHeadingRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: v2Theme.spacing.md,
  },
  headingCopy: {
    flex: 1,
    gap: 3,
  },
  sectionTitle: {
    color: v2Theme.colors.ink,
    fontSize: v2Theme.type.section,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  sectionCaption: {
    color: v2Theme.colors.inkSecondary,
    fontSize: 12,
  },
  textAction: {
    color: v2Theme.colors.brandStrong,
    fontSize: 13,
    fontWeight: "900",
  },
  storyRail: {
    gap: 10,
    paddingRight: 4,
  },
  rideSkeleton: {
    minHeight: 92,
    borderRadius: v2Theme.radius.xl,
    backgroundColor: v2Theme.colors.surfaceMuted,
    padding: v2Theme.spacing.lg,
    gap: 12,
    justifyContent: "center",
  },
  skeletonLineWide: {
    height: 14,
    width: "68%",
    borderRadius: 7,
    backgroundColor: v2Theme.colors.lineStrong,
  },
  skeletonLine: {
    height: 11,
    width: "42%",
    borderRadius: 6,
    backgroundColor: v2Theme.colors.line,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.994 }],
  },
});
