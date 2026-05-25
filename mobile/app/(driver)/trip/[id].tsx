import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { DriverCard } from "../../../components/cards/DriverCard";
import { ErrorState } from "../../../components/states/ErrorState";
import { LoadingState } from "../../../components/states/LoadingState";
import { AppButton } from "../../../components/ui/AppButton";
import { Avatar } from "../../../components/ui/Avatar";
import { ProfileCompletionModal } from "../../../components/ui/ProfileCompletionModal";
import { Screen } from "../../../components/ui/Screen";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { VerifiedBadge } from "../../../components/ui/VerifiedBadge";
import { colors } from "../../../constants/colors";
import { spacing } from "../../../constants/spacing";
import { useCurrentUser } from "../../../hooks/useCurrentUser";
import { updateCurrentUser } from "../../../services/authService";
import { listConversations } from "../../../services/conversationService";
import { acceptRideRequest, cancelPassengerRideRequest, declineRideRequest, driverRideRequests, getRide } from "../../../services/ridesService";
import { Conversation } from "../../../types/conversation.types";
import { Ride, RideRequest } from "../../../types/ride.types";
import { formatTripDate } from "../../../utils/formatDate";
import { formatStatus } from "../../../utils/formatStatus";

export default function DriverTripDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, reload: reloadUser } = useCurrentUser();
  const [ride, setRide] = useState<Ride | null>(null);
  const [requests, setRequests] = useState<RideRequest[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [phone, setPhone] = useState("");
  const [busyRequestId, setBusyRequestId] = useState("");
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    try {
      setLoading(true);
      const [rideData, requestData, conversationData] = await Promise.all([getRide(id), driverRideRequests(), listConversations()]);
      setRide(rideData);
      setRequests(requestData.filter((request) => request.ride_id === id));
      setConversations(conversationData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load trip.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) load();
  }, [id]);

  function conversationFor(request: RideRequest) {
    return conversations.find((conversation) => conversation.request_id === request.id);
  }

  async function setStatus(requestId: string, status: "confirmed" | "declined" | "cancelled_by_driver") {
    if (status === "confirmed" && !user?.phone) {
      setError("Add your phone number before accepting a passenger request.");
      setShowPhoneModal(true);
      return;
    }
    try {
      setBusyRequestId(requestId);
      setError("");
      if (status === "confirmed") await acceptRideRequest(requestId);
      if (status === "declined") await declineRideRequest(requestId);
      if (status === "cancelled_by_driver") await cancelPassengerRideRequest(requestId, "Cancelled by driver from trip management.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update passenger request.");
    } finally {
      setBusyRequestId("");
    }
  }

  async function savePhone() {
    await updateCurrentUser({ phone });
    await reloadUser();
    setShowPhoneModal(false);
  }

  if (loading) {
    return (
      <Screen title="Trip" showBack fallbackRoute="/(driver)/trips" navRole="driver">
        <LoadingState label="Loading trip..." />
      </Screen>
    );
  }

  if (error || !ride) {
    return (
      <Screen title="Trip" showBack fallbackRoute="/(driver)/trips" navRole="driver">
        <ErrorState message={error || "Trip not found."} />
      </Screen>
    );
  }

  return (
    <Screen title="Trip" showBack fallbackRoute="/(driver)/trips" navRole="driver">
      <ProfileCompletionModal
        visible={showPhoneModal}
        phone={phone}
        onChangePhone={setPhone}
        onSave={savePhone}
        onClose={() => setShowPhoneModal(false)}
      />
      <View style={styles.card}>
        <StatusBadge label={formatStatus(ride.status)} tone="success" />
        <Text style={styles.title}>{ride.origin} to {ride.destination}</Text>
        <Text style={styles.body}>{formatTripDate(ride.date, ride.time)}</Text>
        <Text style={styles.body}>{ride.available_seats} seats available - US${ride.price_usd} per seat</Text>
      </View>
      <DriverCard
        name={ride.driver_name}
        rating={ride.driver_rating}
        vehicle={ride.vehicle}
        verified={ride.driver_verification_status === "verified"}
        imageUri={ride.driver_profile_photo_url || ride.driver_avatar_url}
      />
      {!user?.phone ? (
        <View style={styles.card}>
          <StatusBadge label="Phone required" tone="warning" />
          <Text style={styles.body}>
            Add your phone number to continue. Passengers and drivers need a
            reachable number for pickup coordination and trip safety.
          </Text>
          <AppButton title="Add phone number" variant="secondary" onPress={() => setShowPhoneModal(true)} />
        </View>
      ) : null}
      <Text style={styles.sectionTitle}>Passenger requests</Text>
      {requests.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.body}>No passenger requests yet.</Text>
        </View>
      ) : requests.map((request) => (
        <View key={request.id} style={styles.card}>
          <StatusBadge label={formatStatus(request.status)} tone={request.status === "confirmed" ? "success" : "warning"} />
          <View style={styles.passengerRow}>
            <Avatar name={request.passenger_name} imageUri={request.passenger_profile_photo_url} size={42} />
            <View style={styles.passengerCopy}>
              <View style={styles.nameRow}>
                <Text style={styles.requestName}>{request.passenger_name}</Text>
                <VerifiedBadge verified={request.passenger_verification_status === "verified"} />
              </View>
            </View>
          </View>
          <Text style={styles.body}>{request.passenger_note || "No note from passenger."}</Text>
          <View style={styles.actions}>
            {conversationFor(request) ? (
              <AppButton title="Message" variant="secondary" onPress={() => router.push(`/(shared)/conversation/${conversationFor(request)?.id}` as never)} />
            ) : null}
            {request.status === "pending" ? (
              <>
                <AppButton title="Accept request" loading={busyRequestId === request.id} onPress={() => setStatus(request.id, "confirmed")} />
                <AppButton title="Decline" variant="ghost" loading={busyRequestId === request.id} onPress={() => setStatus(request.id, "declined")} />
              </>
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
});
