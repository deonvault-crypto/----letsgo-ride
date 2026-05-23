import { useMemo } from "react";
import { StyleSheet, Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { RideCard } from "../../components/cards/RideCard";
import { EmptyState } from "../../components/states/EmptyState";
import { ErrorState } from "../../components/states/ErrorState";
import { LoadingState } from "../../components/states/LoadingState";
import { Screen } from "../../components/ui/Screen";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { useRides } from "../../hooks/useRides";

export default function ResultsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ origin?: string; destination?: string; date?: string; seats?: string }>();
  const searchParams = useMemo(
    () => ({
      origin: params.origin || "",
      destination: params.destination || "",
      date: params.date || "",
      seats: Number(params.seats || 1),
    }),
    [params.origin, params.destination, params.date, params.seats],
  );
  const { rides, loading, error, reload } = useRides(searchParams);

  return (
    <Screen title="Results" navRole="passenger">
      <Text style={styles.title}>{searchParams.origin || "Any origin"} to {searchParams.destination || "any destination"}</Text>
      <Text style={styles.body}>Showing rides with at least {searchParams.seats} seat available.</Text>
      {loading ? <LoadingState label="Searching rides..." /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {!loading && !error && rides.length === 0 ? (
        <EmptyState title="No rides yet" body="Try a nearby city, a later date, or fewer seats." />
      ) : null}
      {!loading && !error && rides.map((ride) => (
        <RideCard
          key={ride.id}
          ride={ride}
          onPress={() => router.push(`/(passenger)/ride/${ride.id}` as never)}
        />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 28,
  },
  body: {
    color: colors.mutedText,
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
});
