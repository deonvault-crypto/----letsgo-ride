import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { RideCard } from "../../components/cards/RideCard";
import { RouteSearchCard } from "../../components/cards/RouteSearchCard";
import { EmptyState } from "../../components/states/EmptyState";
import { ErrorState } from "../../components/states/ErrorState";
import { LoadingState } from "../../components/states/LoadingState";
import { AppButton } from "../../components/ui/AppButton";
import { Avatar } from "../../components/ui/Avatar";
import { PopularRouteChips } from "../../components/ui/PopularRouteChips";
import { Screen } from "../../components/ui/Screen";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { VerifiedBadge, isIdentityVerified } from "../../components/ui/VerifiedBadge";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useRides } from "../../hooks/useRides";
import { firstNameOrFallback } from "../../utils/displayName";
import { isRideBookable } from "../../utils/tripLifecycle";

export default function PassengerHomeScreen() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const { rides, loading, error, reload } = useRides();
  const passengerName = firstNameOrFallback(user?.name);
  const verified = isIdentityVerified(user);
  const upcomingRides = rides.filter((ride) => isRideBookable(ride));
  function openDriverProfile(driverId: string | undefined, rideId: string) {
    if (!driverId) return;
    router.push(`/(shared)/driver-profile/${driverId}?rideId=${rideId}` as never);
  }

  return (
    <Screen navRole="passenger">
      <View style={styles.hero}>
        <View style={styles.greetingRow}>
          <Avatar name={user?.name || passengerName} imageUri={user?.profile_photo_url} size={54} />
          <View style={styles.greetingCopy}>
            <StatusBadge label="Passenger" tone="neutral" />
            <View style={styles.nameRow}>
              <Text style={styles.title}>Hi, {passengerName}</Text>
              <VerifiedBadge verified={verified} size="medium" />
            </View>
          </View>
        </View>
        <Text style={styles.body}>Find verified rides, compare prices, and reserve seats safely.</Text>
      </View>

      <RouteSearchCard onPress={() => router.replace("/(passenger)/search" as never)} />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Popular routes</Text>
        <PopularRouteChips
          onSelect={(origin, destination) =>
            router.push({
              pathname: "/(passenger)/results",
              params: { origin, destination, seats: "1" },
            } as never)
          }
        />
      </View>

      <View style={styles.section}>
        <View style={styles.rowBetween}>
          <Text style={styles.sectionTitle}>Nearby upcoming rides</Text>
          <AppButton title="Post trip" variant="ghost" onPress={() => router.push("/(driver)/post-trip" as never)} />
        </View>
        {loading ? <LoadingState label="Loading rides..." /> : null}
        {error ? <ErrorState message={error} onRetry={reload} /> : null}
        {!loading && !error && upcomingRides.length === 0 ? (
          <EmptyState
            title="No upcoming rides yet"
            body="Check again later or post a trip."
            icon="car-clock"
          />
        ) : null}
        {!loading && !error && upcomingRides.slice(0, 3).map((ride) => (
          <RideCard
            key={ride.id}
            ride={ride}
            onPress={() => router.push(`/(passenger)/ride/${ride.id}` as never)}
            onDriverPress={() => openDriverProfile(ride.driver_id, ride.id)}
          />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  title: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 32,
    lineHeight: 38,
  },
  greetingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  greetingCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexWrap: "wrap",
  },
  body: {
    color: colors.mutedText,
    lineHeight: 22,
    fontSize: 15,
  },
  section: {
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.whiteText,
    fontSize: 19,
    fontWeight: "900",
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
  },
});
