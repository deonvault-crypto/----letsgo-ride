import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { DriverCard } from "../../../components/cards/DriverCard";
import { ErrorState } from "../../../components/states/ErrorState";
import { LoadingState } from "../../../components/states/LoadingState";
import { AppButton } from "../../../components/ui/AppButton";
import { ProfileCompletionModal } from "../../../components/ui/ProfileCompletionModal";
import { Screen } from "../../../components/ui/Screen";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { colors } from "../../../constants/colors";
import { spacing } from "../../../constants/spacing";
import { useCurrentUser } from "../../../hooks/useCurrentUser";
import { updateCurrentUser } from "../../../services/authService";
import { driverRideRequests, getRide, updateRideRequest } from "../../../services/ridesService";
import { Ride, RideRequest } from "../../../types/ride.types";
import { formatStatus } from "../../../utils/formatStatus";

export default function DriverTripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, reload: reloadUser } = useCurrentUser();
  const [ride, setRide] = useState<Ride | null>(null);
  const [requests, setRequests] = useState<RideRequest[]>([]);
  const [phone, setPhone] = useState("");
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    try {
      setLoading(true);
      const [rideData, requestData] = await Promise.all([getRide(id), driverRideRequests()]);
      setRide(rideData);
      setRequests(requestData.filter((request) => request.ride_id === id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load trip.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) load();
  }, [id]);

  async function setStatus(requestId: string, status: RideRequest["status"]) {
    if (status === "confirmed" && !user?.phone) {
      setError("Add your phone number before accepting a passenger request.");
      setShowPhoneModal(true);
      return;
    }
    await updateRideRequest(requestId, status);
    await load();
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
        <Text style={styles.body}>{ride.date} at {ride.time}</Text>
        <Text style={styles.body}>{ride.available_seats} seats available - US${ride.price_usd} per seat</Text>
      </View>
      <DriverCard
        name={ride.driver_name}
        rating={ride.driver_rating}
        vehicle={ride.vehicle}
        verified={ride.driver_verification_status === "verified"}
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
          <Text style={styles.requestName}>{request.passenger_name}</Text>
          <Text style={styles.body}>{request.passenger_note || "No note from passenger."}</Text>
          <View style={styles.actions}>
            <AppButton title="Approve" onPress={() => setStatus(request.id, "confirmed")} />
            <AppButton title="Decline" variant="ghost" onPress={() => setStatus(request.id, "declined")} />
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
});
