import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { RideCard } from "../../components/cards/RideCard";
import { RouteSearchCard } from "../../components/cards/RouteSearchCard";
import { ErrorState } from "../../components/states/ErrorState";
import { LoadingState } from "../../components/states/LoadingState";
import { AppButton } from "../../components/ui/AppButton";
import { PopularRouteChips } from "../../components/ui/PopularRouteChips";
import { Screen } from "../../components/ui/Screen";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useRides } from "../../hooks/useRides";
import { firstNameOrFallback } from "../../utils/displayName";

export default function PassengerHomeScreen() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const { rides, loading, error, reload } = useRides();
  const passengerName = firstNameOrFallback(user?.name);

  return (
    <Screen navRole="passenger">
      <View style={styles.hero}>
        <StatusBadge label="Passenger" tone="neutral" />
        <Text style={styles.title}>Hi, {passengerName}</Text>
        <Text style={styles.body}>
          Search verified shared rides across Zimbabwe and reserve a seat with
          clear trip details.
        </Text>
      </View>

      <RouteSearchCard onPress={() => router.push("/(passenger)/search" as never)} />

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
          <AppButton title="Offer ride" variant="ghost" onPress={() => router.push("/(driver)/post-trip" as never)} />
        </View>
        {loading ? <LoadingState label="Loading rides..." /> : null}
        {error ? <ErrorState message={error} onRetry={reload} /> : null}
        {!loading && !error && rides.slice(0, 3).map((ride) => (
          <RideCard
            key={ride.id}
            ride={ride}
            onPress={() => router.push(`/(passenger)/ride/${ride.id}` as never)}
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
    fontSize: 34,
  },
  body: {
    color: colors.mutedText,
    lineHeight: 22,
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
