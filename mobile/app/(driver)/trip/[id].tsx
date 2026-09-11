import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { DriverCard } from "../../../components/cards/DriverCard";
import { ReviewPromptCard } from "../../../components/reviews/ReviewPromptCard";
import { ErrorState } from "../../../components/states/ErrorState";
import { LoadingState } from "../../../components/states/LoadingState";
import { AppButton } from "../../../components/ui/AppButton";
import { Avatar } from "../../../components/ui/Avatar";
import { LiveTripPanel } from "../../../components/trips/LiveTripPanel";
import { Screen } from "../../../components/ui/Screen";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { VerifiedBadge } from "../../../components/ui/VerifiedBadge";
import { colors } from "../../../constants/colors";
import { spacing } from "../../../constants/spacing";
import { useDriverWorkspace } from "../../../contexts/DriverWorkspaceContext";
import { useCurrentUser } from "../../../hooks/useCurrentUser";
import { listConversations } from "../../../services/conversationService";
import { listPendingReviews } from "../../../services/reviewService";
import { acceptRideRequest, cancelPassengerRideRequest, declineRideRequest, endTrip, getRide, startTrip } from "../../../services/ridesService";
import { Conversation } from "../../../types/conversation.types";
import { RideRequest } from "../../../types/ride.types";
import { PendingReview } from "../../../types/review.types";
import { formatTripDate } from "../../../utils/formatDate";
import { formatStatus } from "../../../utils/formatStatus";
import { canonicalRideStatus, departureCountdown, isTripActive, isTripFinal, tripStatusLabel, tripStatusTone } from "../../../utils/tripLifecycle";
import { isVerifiedStatus } from "../../../utils/verificationStatus";

export default function DriverTripDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useCurrentUser();
  const { rides, requests: workspaceRequests, loading: workspaceLoading, error: workspaceError, reconcile, upsertRide, upsertRequest } = useDriverWorkspace();
  const ride = useMemo(() => rides.find((item) => item.id === id) || null, [id, rides]);
  const requests = useMemo(() => workspaceRequests.filter((request) => request.ride_id === id), [id, workspaceRequests]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [pendingReviews, setPendingReviews] = useState<PendingReview[]>([]);
  const [busyRequestId, setBusyRequestId] = useState("");
  const [busyTripAction, setBusyTripAction] = useState<"start" | "end" | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDetail = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError("");
      const [rideData, conversationData, pendingReviewData] = await Promise.all([getRide(id), listConversations(), listPendingReviews()]);
      upsertRide(rideData);
      setConversations(conversationData);
      setPendingReviews(pendingReviewData.filter((review) => review.trip_id === id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load trip.");
    } finally {
      setLoading(false);
    }
  }, [id, upsertRide]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  function conversationFor(request: RideRequest) {
    return conversations.find((conversation) => conversation.request_id === request.id);
  }

  function openReview(review: PendingReview) {
    router.push({
      pathname: "/(shared)/review",
      params: {
        tripId: review.trip_id,
        revieweeId: review.reviewee_id,
        revieweeName: review.reviewee_name,
        reviewerRole: review.reviewer_role,
        revieweeRole: review.reviewee_role,
      },
    } as never);
  }

  function openPassengerProfile(request: RideRequest) {
    if (!request.user_id) return;
    router.push({
      pathname: "/(shared)/passenger-profile/[id]",
      params: {
        id: request.user_id,
        name: request.passenger_name,
        photo: request.passenger_profile_photo_url || "",
        rideId: ride?.id || "",
      },
    } as never);
  }

  async function setStatus(requestId: string, status: "confirmed" | "declined" | "cancelled_by_driver") {
    if (status === "confirmed" && !user?.phone) {
      setError("Contact support to add or correct the phone number on your verified Driver account.");
      return;
    }
    try {
      setBusyRequestId(requestId);
      setError("");
      let updated: RideRequest | null = null;
      if (status === "confirmed") updated = await acceptRideRequest(requestId);
      if (status === "declined") updated = await declineRideRequest(requestId);
      if (status === "cancelled_by_driver") updated = await cancelPassengerRideRequest(requestId, "Cancelled by driver from trip management.");
      if (updated) upsertRequest(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update passenger request.");
    } finally {
      setBusyRequestId("");
    }
  }

  async function startCurrentTrip() {
    try {
      setBusyTripAction("start");
      setError("");
      upsertRide(await startTrip(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start this trip.");
    } finally {
      setBusyTripAction("");
    }
  }

  async function endCurrentTrip() {
    try {
      setBusyTripAction("end");
      setError("");
      upsertRide(await endTrip(id));
      const nextReviews = await listPendingReviews();
      setPendingReviews(nextReviews.filter((review) => review.trip_id === id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not end this trip.");
    } finally {
      setBusyTripAction("");
    }
  }

  if (loading || workspaceLoading) {
    return (
      <Screen title="Trip" showBack fallbackRoute="/(driver)/trips" navRole="driver">
        <LoadingState label="Loading trip..." />
      </Screen>
    );
  }

  if (!ride) {
    return (
      <Screen title="Trip" showBack fallbackRoute="/(driver)/trips" navRole="driver">
        <ErrorState message={error || workspaceError || "Trip not found."} onRetry={() => { void Promise.all([reconcile(), loadDetail()]); }} />
      </Screen>
    );
  }

  const tripStatus = canonicalRideStatus(ride.status);
  const countdown = departureCountdown(ride);
  const canAcceptRequests = ["SCHEDULED", "BOARDING"].includes(tripStatus);
  const tripComplete = isTripFinal(ride);

  return (
    <Screen title="Trip" showBack fallbackRoute="/(driver)/trips" navRole="driver">
      {error ? <ErrorState message={error} /> : null}
      <View style={styles.card}>
        <StatusBadge label={tripStatusLabel(tripStatus)} tone={tripStatusTone(tripStatus)} />
        <Text style={styles.title}>{ride.origin} to {ride.destination}</Text>
        {countdown ? <Text style={styles.body}>{countdown}</Text> : null}
        <Text style={styles.body}>{formatTripDate(ride.date, ride.time)}</Text>
        <Text style={styles.body}>{ride.available_seats} seats available - US${ride.price_usd} per seat</Text>
        {ride.can_start_trip ? (
          <AppButton title="Start Trip" loading={busyTripAction === "start"} onPress={startCurrentTrip} />
        ) : null}
        {ride.can_end_trip || isTripActive(ride) ? (
          <AppButton title="End Trip" variant="secondary" loading={busyTripAction === "end"} onPress={endCurrentTrip} />
        ) : null}
        {!ride.can_start_trip && tripStatus === "SCHEDULED" ? (
          <Text style={styles.helperText}>Start Trip appears 15 minutes before departure.</Text>
        ) : null}
        {tripComplete ? <Text style={styles.helperText}>Completed, expired, or cancelled trips are archived and can no longer be edited.</Text> : null}
      </View>
      <DriverCard
        name={ride.driver_name}
        rating={ride.driver_rating}
        vehicle={ride.vehicle}
        verified={isVerifiedStatus(ride.driver_verification_status)}
        imageUri={ride.driver_profile_photo_url || ride.driver_avatar_url}
        reviewCount={ride.driver_review_count}
        completedTripsCount={ride.driver_completed_trips_count}
      />
      {pendingReviews.map((review) => (
        <ReviewPromptCard key={`${review.trip_id}-${review.reviewee_id}`} review={review} onPress={() => openReview(review)} />
      ))}
      {!user?.phone ? (
        <View style={styles.card}>
          <StatusBadge label="Phone required" tone="warning" />
          <Text style={styles.body}>
            Contact support to add or correct the phone number on your verified Driver account. Passengers and drivers need a
            reachable number for pickup coordination and trip safety.
          </Text>
          <AppButton title="Request a contact update" variant="secondary" onPress={() => router.push({ pathname: "/(shared)/support", params: { product: "driver", subject: "Account details change" } } as never)} />
        </View>
      ) : null}
      {isTripActive(ride) ? <LiveTripPanel ride={ride} role="driver" onRideMutation={upsertRide} /> : null}
      <Text style={styles.sectionTitle}>Passenger requests</Text>
      {requests.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.body}>No passenger requests yet.</Text>
        </View>
      ) : requests.map((request) => (
        <View key={request.id} style={styles.card}>
          <StatusBadge label={formatStatus(request.status)} tone={request.status === "confirmed" ? "success" : "warning"} />
          <Pressable
            accessibilityRole={request.user_id ? "button" : undefined}
            accessibilityLabel={request.user_id ? `Open ${request.passenger_name}'s profile` : undefined}
            disabled={!request.user_id}
            onPress={() => openPassengerProfile(request)}
            style={({ pressed }) => [styles.passengerRow, pressed && styles.linkPressed]}
          >
            <Avatar name={request.passenger_name} imageUri={request.passenger_profile_photo_url} size={42} />
            <View style={styles.passengerCopy}>
              <View style={styles.nameRow}>
                <Text style={styles.requestName}>{request.passenger_name}</Text>
                <VerifiedBadge verified={isVerifiedStatus(request.passenger_verification_status)} />
              </View>
            </View>
          </Pressable>
          <Text style={styles.body}>{request.passenger_note || "No note from passenger."}</Text>
          <View style={styles.actions}>
            {conversationFor(request) ? (
              <AppButton title="Message" variant="secondary" onPress={() => router.push(`/(shared)/conversation/${conversationFor(request)?.id}` as never)} />
            ) : null}
            {request.status === "pending" && canAcceptRequests ? (
              <>
                <AppButton title="Accept request" loading={busyRequestId === request.id} onPress={() => setStatus(request.id, "confirmed")} />
                <AppButton title="Decline" variant="ghost" loading={busyRequestId === request.id} onPress={() => setStatus(request.id, "declined")} />
              </>
            ) : null}
            {request.status === "pending" && !canAcceptRequests ? (
              <Text style={styles.helperText}>This request can no longer be accepted because the trip is not open for boarding.</Text>
            ) : null}
            {request.status === "confirmed" ? (
              <AppButton title="Cancel passenger" variant="danger" loading={busyRequestId === request.id} onPress={() => setStatus(request.id, "cancelled_by_driver")} />
            ) : null}
          </View>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 28,
  },
  body: {
    color: colors.mutedText,
    lineHeight: 21,
  },
  helperText: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },
  sectionTitle: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 20,
  },
  requestName: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 18,
  },
  actions: {
    gap: spacing.sm,
  },
  passengerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  passengerCopy: {
    flex: 1,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexWrap: "wrap",
  },
  linkPressed: {
    opacity: 0.75,
  },
});
