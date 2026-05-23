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
import { useRides } from "../../hooks/useRides";

export default function DriverHomeScreen() {
  const router = useRouter();
  const { driver } = useDriver();
  const { rides, loading, error, reload } = useRides();

  return (
    <Screen title="Driver" navRole="driver">
      <View style={styles.hero}>
        <StatusBadge label={driver?.verified ? "Verified driver" : "Verification placeholder"} tone={driver?.verified ? "success" : "warning"} />
        <Text style={styles.title}>Drive planned routes. Earn from empty seats.</Text>
        <Text style={styles.body}>Post trips, review passenger requests, and keep clear records for each ride.</Text>
        <AppButton title="Post Trip" onPress={() => router.push("/(driver)/post-trip" as never)} />
      </View>
      <View style={styles.metrics}>
        <Metric label="Today trips" value={String(rides.length)} />
        <Metric label="Seat requests" value="0" />
      </View>
      <Text style={styles.sectionTitle}>Your route board</Text>
      {loading ? <LoadingState label="Loading driver trips..." /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {!loading && !error && rides.slice(0, 3).map((ride) => (
        <RideCard
          key={ride.id}
          ride={ride}
          onPress={() => router.push(`/(driver)/trip/${ride.id}` as never)}
        />
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
});
