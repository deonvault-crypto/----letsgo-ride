import { StyleSheet, Text, View } from "react-native";

import { EmptyState } from "../../components/states/EmptyState";
import { ErrorState } from "../../components/states/ErrorState";
import { LoadingState } from "../../components/states/LoadingState";
import { Screen } from "../../components/ui/Screen";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { useTrips } from "../../hooks/useTrips";
import { formatStatus } from "../../utils/formatStatus";

export default function MyTripsScreen() {
  const { trips, loading, error, reload } = useTrips();

  return (
    <Screen title="Trips" navRole="passenger">
      <Text style={styles.title}>My trips</Text>
      {loading ? <LoadingState label="Loading trips..." /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {!loading && !error && trips.length === 0 ? (
        <EmptyState title="No trips yet" body="Your ride requests will appear here." />
      ) : null}
      {!loading && !error && trips.map((trip) => (
        <View key={trip.id} style={styles.card}>
          <StatusBadge label={formatStatus(trip.status)} tone={trip.status === "confirmed" ? "success" : trip.status === "declined" ? "danger" : "warning"} />
          <Text style={styles.route}>
            {trip.ride_snapshot?.origin || "Ride"} to {trip.ride_snapshot?.destination || "destination"}
          </Text>
          <Text style={styles.body}>{trip.passenger_note || "No passenger note added."}</Text>
        </View>
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
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 22,
    padding: spacing.lg,
    gap: spacing.md,
  },
  route: {
    color: colors.whiteText,
    fontSize: 18,
    fontWeight: "900",
  },
  body: {
    color: colors.mutedText,
    lineHeight: 21,
  },
});
