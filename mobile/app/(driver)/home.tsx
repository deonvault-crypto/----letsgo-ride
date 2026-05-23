import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { RideCard } from "../../components/cards/RideCard";
import { ErrorState } from "../../components/states/ErrorState";
import { LoadingState } from "../../components/states/LoadingState";
import { AppButton } from "../../components/ui/AppButton";
import { Screen } from "../../components/ui/Screen";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { useDriver } from "../../hooks/useDriver";
import { useDriverRequests } from "../../hooks/useDriverRequests";
import { useRides } from "../../hooks/useRides";
import { formatStatus } from "../../utils/formatStatus";

export default function DriverHomeScreen() {
  const router = useRouter();
  const { driver } = useDriver();
  const { rides, loading, error, reload } = useRides();
  const {
    requests,
    loading: requestsLoading,
    error: requestsError,
    reload: reloadRequests,
  } = useDriverRequests();
  const driverStatus = driver?.verified ? "Verified" : driver?.status === "suspended" ? "Suspended" : "Pending verification";

  return (
    <Screen title="Driver" navRole="driver">
      <View style={styles.hero}>
        <StatusBadge label={driverStatus} tone={driver?.verified ? "success" : driver?.status === "suspended" ? "danger" : "warning"} />
        <Text style={styles.title}>Drive planned routes. Earn from empty seats.</Text>
        <Text style={styles.body}>Post trips, review passenger requests, and keep clear records for each ride.</Text>
        <AppButton title="Post Trip" onPress={() => router.push("/(driver)/post-trip" as never)} />
      </View>
      <View style={styles.metrics}>
        <Metric label="Today trips" value={String(rides.length)} />
        <Metric label="Seat requests" value={String(requests.length)} />
      </View>
      <Text style={styles.sectionTitle}>Posted trips</Text>
      {loading ? <LoadingState label="Loading driver trips..." /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {!loading && !error && rides.slice(0, 3).map((ride) => (
        <RideCard
          key={ride.id}
          ride={ride}
          onPress={() => router.push(`/(driver)/trip/${ride.id}` as never)}
        />
      ))}

      <Text style={styles.sectionTitle}>Incoming passenger requests</Text>
      {requestsLoading ? <LoadingState label="Loading passenger requests..." /> : null}
      {requestsError ? <ErrorState message={requestsError} onRetry={reloadRequests} /> : null}
      {!requestsLoading && !requestsError && requests.length === 0 ? (
        <View style={styles.requestCard}>
          <Text style={styles.body}>No passenger requests yet.</Text>
        </View>
      ) : requests.slice(0, 4).map((request) => (
        <View key={request.id} style={styles.requestCard}>
          <StatusBadge label={formatStatus(request.status)} tone={request.status === "confirmed" ? "success" : request.status === "declined" ? "danger" : "warning"} />
          <Text style={styles.requestTitle}>{request.passenger_name}</Text>
          <Text style={styles.body}>
            {request.ride_snapshot?.origin || "Ride"} to {request.ride_snapshot?.destination || "destination"} - {request.seats} seat
          </Text>
        </View>
      ))}
    </Screen>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.card,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 30,
    lineHeight: 34,
  },
  body: {
    color: colors.mutedText,
    lineHeight: 22,
  },
  metrics: {
    flexDirection: "row",
    gap: spacing.md,
  },
  metric: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: spacing.lg,
  },
  metricValue: {
    color: colors.softGreen,
    fontWeight: "900",
    fontSize: 26,
  },
  metricLabel: {
    color: colors.mutedText,
    fontWeight: "700",
    marginTop: 4,
  },
  sectionTitle: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 20,
  },
  requestCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  requestTitle: {
    color: colors.whiteText,
    fontSize: 18,
    fontWeight: "900",
  },
});
