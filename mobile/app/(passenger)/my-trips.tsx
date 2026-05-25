import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { EmptyState } from "../../components/states/EmptyState";
import { ErrorState } from "../../components/states/ErrorState";
import { LoadingState } from "../../components/states/LoadingState";
import { AppButton } from "../../components/ui/AppButton";
import { Avatar } from "../../components/ui/Avatar";
import { Screen } from "../../components/ui/Screen";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { VerifiedBadge } from "../../components/ui/VerifiedBadge";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { useTrips } from "../../hooks/useTrips";
import { listConversations } from "../../services/conversationService";
import { cancelMyRideRequest } from "../../services/ridesService";
import { Conversation } from "../../types/conversation.types";
import { RideRequest } from "../../types/ride.types";
import { formatTripDate } from "../../utils/formatDate";
import { formatStatus } from "../../utils/formatStatus";

export default function MyTripsScreen() {
  const router = useRouter();
  const { trips, loading, error, reload } = useTrips();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [busyRequestId, setBusyRequestId] = useState("");
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    listConversations().then(setConversations).catch(() => undefined);
  }, [trips.length]);

  function conversationFor(trip: RideRequest) {
    return conversations.find((conversation) => conversation.request_id === trip.id);
  }

  function tripDeparted(trip: RideRequest) {
    const ride = trip.ride_snapshot;
    return Boolean(ride?.is_departed || ride?.status === "departed" || ride?.status === "completed");
  }

  async function cancelTrip(trip: RideRequest) {
    try {
      setBusyRequestId(trip.id);
      setActionError("");
      await cancelMyRideRequest(trip.id);
      await reload();
      setConversations(await listConversations());
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not cancel booking.");
    } finally {
      setBusyRequestId("");
    }
  }

  return (
    <Screen title="Trips" navRole="passenger">
      <Text style={styles.title}>My trips</Text>
      {actionError ? <ErrorState message={actionError} onRetry={reload} /> : null}
      {loading ? <LoadingState label="Loading trips..." /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {!loading && !error && trips.length === 0 ? (
        <EmptyState
          title="No trips yet"
          body="Your ride requests and confirmed bookings will appear here."
          icon="ticket-confirmation-outline"
          actionLabel="Search rides"
          onAction={() => router.replace("/(passenger)/search" as never)}
        />
      ) : null}
      {!loading && !error && trips.map((trip) => {
        const departed = tripDeparted(trip);
        return (
        <View key={trip.id} style={[styles.card, departed && styles.departedCard]}>
          <StatusBadge label={formatStatus(trip.status)} tone={trip.status === "confirmed" ? "success" : trip.status === "declined" ? "danger" : "warning"} />
          <View style={styles.driverRow}>
            <Avatar name={trip.ride_snapshot?.driver_name || "Driver"} imageUri={trip.ride_snapshot?.driver_profile_photo_url || undefined} size={42} />
            <View style={styles.driverCopy}>
              <View style={styles.nameRow}>
                <Text style={styles.driverName}>{trip.ride_snapshot?.driver_name || "Driver"}</Text>
                <VerifiedBadge verified={trip.ride_snapshot?.driver_verification_status === "verified"} />
              </View>
              <Text style={styles.body}>{trip.ride_snapshot?.vehicle || "Vehicle details in trip"}</Text>
            </View>
          </View>
          <Text style={styles.route}>
            {trip.ride_snapshot?.origin || "Ride"} to {trip.ride_snapshot?.destination || "destination"}
          </Text>
          <Text style={styles.body}>
            {formatTripDate(trip.ride_snapshot?.date || "", trip.ride_snapshot?.time)} - {trip.seats} {trip.seats === 1 ? "seat" : "seats"}
          </Text>
          {departed ? <StatusBadge label="Trip departed" tone="neutral" /> : null}
          {trip.passenger_note ? <Text style={styles.body}>{trip.passenger_note}</Text> : null}
          {trip.status === "pending" || trip.status === "confirmed" ? (
            <View style={styles.actions}>
              {conversationFor(trip) ? (
                <AppButton title="Message driver" variant="secondary" onPress={() => router.push(`/(shared)/conversation/${conversationFor(trip)?.id}` as never)} />
              ) : null}
              {!departed ? (
                <AppButton title={trip.status === "pending" ? "Cancel request" : "Cancel booking"} variant="danger" loading={busyRequestId === trip.id} onPress={() => cancelTrip(trip)} />
              ) : null}
            </View>
          ) : null}
        </View>
      );})}
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
  departedCard: {
    backgroundColor: colors.elevated,
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
  driverRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  driverCopy: {
    flex: 1,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexWrap: "wrap",
  },
  driverName: {
    color: colors.whiteText,
    fontWeight: "900",
  },
  actions: {
    gap: spacing.sm,
  },
});
