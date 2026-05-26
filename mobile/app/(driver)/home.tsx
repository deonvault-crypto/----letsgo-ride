import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { RideCard } from "../../components/cards/RideCard";
import { EmptyState } from "../../components/states/EmptyState";
import { ErrorState } from "../../components/states/ErrorState";
import { LoadingState } from "../../components/states/LoadingState";
import { AppButton } from "../../components/ui/AppButton";
import { Avatar } from "../../components/ui/Avatar";
import { Screen } from "../../components/ui/Screen";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { VerifiedBadge, isIdentityVerified } from "../../components/ui/VerifiedBadge";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useDriver } from "../../hooks/useDriver";
import { useDriverRides } from "../../hooks/useDriverRides";
import { useDriverRequests } from "../../hooks/useDriverRequests";
import { firstNameOrFallback } from "../../utils/displayName";
import { formatStatus } from "../../utils/formatStatus";
import { isVerifiedStatus } from "../../utils/verificationStatus";

export default function DriverHomeScreen() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const { driver } = useDriver();
  const { rides: ownRides, loading, error, reload } = useDriverRides();
  const {
    requests,
    loading: requestsLoading,
    error: requestsError,
    reload: reloadRequests,
  } = useDriverRequests();
  const driverStatus = driver?.verified
    ? "Verified"
    : driver?.status === "suspended"
      ? "Suspended"
      : formatStatus(driver?.verification_status || driver?.status || "pending_verification");

  const firstName = firstNameOrFallback(user?.name);
  const identityVerified = isIdentityVerified(user) || isVerifiedStatus(driver?.verification_status);

  return (
    <Screen navRole="driver">
      <View style={styles.hero}>
        <View style={styles.greetingRow}>
          <Avatar name={user?.name || firstName} imageUri={user?.profile_photo_url} size={54} />
          <View style={styles.greetingCopy}>
            <StatusBadge label={driverStatus} tone={driver?.verified ? "success" : driver?.status === "suspended" ? "danger" : "warning"} />
            <View style={styles.nameRow}>
              <Text style={styles.title}>Hi, {firstName}</Text>
              <VerifiedBadge verified={identityVerified} size="medium" />
            </View>
          </View>
        </View>
        <Text style={styles.body}>Post trips and manage passenger requests with clear trip records.</Text>
        <AppButton title="Post trip" onPress={() => router.replace("/(driver)/post-trip" as never)} />
        <AppButton title={identityVerified ? "Verification status" : "Driver verification"} variant="secondary" onPress={() => router.push("/(shared)/verification" as never)} />
      </View>
      <View style={styles.metrics}>
        <Metric label="Today trips" value={String(ownRides.length)} />
        <Metric label="Seat requests" value={String(requests.length)} />
      </View>
      <Text style={styles.sectionTitle}>Posted trips</Text>
      {loading ? <LoadingState label="Loading driver trips..." /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {!loading && !error && ownRides.length === 0 ? (
        <EmptyState
          title="No posted trips"
          body="Post your first trip when you are ready to accept passenger requests."
          icon="car-outline"
          actionLabel="Post trip"
          onAction={() => router.replace("/(driver)/post-trip" as never)}
        />
      ) : null}
      {!loading && !error && ownRides.slice(0, 3).map((ride) => (
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
        <EmptyState
          title="No passenger requests"
          body="New seat requests for your posted rides will appear here."
          icon="account-clock-outline"
        />
      ) : requests.slice(0, 4).map((request) => (
        <View key={request.id} style={styles.requestCard}>
          <StatusBadge label={formatStatus(request.status)} tone={request.status === "confirmed" ? "success" : request.status === "declined" ? "danger" : "warning"} />
          <View style={styles.passengerRow}>
            <Avatar name={request.passenger_name} imageUri={request.passenger_profile_photo_url} size={38} />
            <View style={styles.passengerCopy}>
              <View style={styles.nameRow}>
                <Text style={styles.requestTitle}>{request.passenger_name}</Text>
                <VerifiedBadge verified={isVerifiedStatus(request.passenger_verification_status)} />
              </View>
            </View>
          </View>
          <Text style={styles.body}>
            {request.ride_snapshot?.origin || "Ride"} to {request.ride_snapshot?.destination || "destination"} - {request.seats} {request.seats === 1 ? "seat" : "seats"}
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
  passengerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  passengerCopy: {
    flex: 1,
  },
});
