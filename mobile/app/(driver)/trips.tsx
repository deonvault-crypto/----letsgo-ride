import { StyleSheet, Text } from "react-native";
import { useRouter } from "expo-router";

import { RideCard } from "../../components/cards/RideCard";
import { EmptyState } from "../../components/states/EmptyState";
import { ErrorState } from "../../components/states/ErrorState";
import { LoadingState } from "../../components/states/LoadingState";
import { Screen } from "../../components/ui/Screen";
import { colors } from "../../constants/colors";
import { useRides } from "../../hooks/useRides";

export default function DriverTripsScreen() {
  const router = useRouter();
  const { rides, loading, error, reload } = useRides();
  const ownRides = rides.filter((ride) => ride.is_own_ride);

  return (
    <Screen title="Trips" navRole="driver">
      <Text style={styles.title}>Driver trips</Text>
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
      {!loading && !error && ownRides.map((ride) => (
        <RideCard
          key={ride.id}
          ride={ride}
          onPress={() => router.push(`/(driver)/trip/${ride.id}` as never)}
        />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 30,
  },
});
