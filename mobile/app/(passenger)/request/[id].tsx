import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ErrorState } from "../../../components/states/ErrorState";
import { LoadingState } from "../../../components/states/LoadingState";
import { AppButton } from "../../../components/ui/AppButton";
import { AppInput } from "../../../components/ui/AppInput";
import { ProfileCompletionModal } from "../../../components/ui/ProfileCompletionModal";
import { Screen } from "../../../components/ui/Screen";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { colors } from "../../../constants/colors";
import { spacing } from "../../../constants/spacing";
import { useCurrentUser } from "../../../hooks/useCurrentUser";
import { updateCurrentUser } from "../../../services/authService";
import { getRide, requestSeat } from "../../../services/ridesService";
import { Ride } from "../../../types/ride.types";

export default function RequestSeatScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, loading: userLoading, error: userError, reload: reloadUser } = useCurrentUser();
  const [ride, setRide] = useState<Ride | null>(null);
  const [note, setNote] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [showPhoneModal, setShowPhoneModal] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        setRide(await getRide(id));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load ride.");
      } finally {
        setLoading(false);
      }
    }
    if (id) load();
  }, [id]);

  async function submit() {
    if (!user?.phone) {
      setError("Add your phone number before booking a seat.");
      setShowPhoneModal(true);
      return;
    }
    try {
      setSaving(true);
      await requestSeat({
        ride_id: id,
        passenger_name: user?.name || "Passenger",
        passenger_phone: user.phone,
        passenger_note: note,
        seats: 1,
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to request seat.");
    } finally {
      setSaving(false);
    }
  }

  async function savePhone() {
    try {
      setSaving(true);
      setError("");
      await updateCurrentUser({ phone });
      await reloadUser();
      setShowPhoneModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save phone number.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Screen title="Request" showBack fallbackRoute="/(passenger)/search" navRole="passenger">
        <LoadingState label="Preparing request..." />
      </Screen>
    );
  }

  return (
    <Screen title="Request" showBack fallbackRoute="/(passenger)/search" navRole="passenger">
      <ProfileCompletionModal
        visible={showPhoneModal}
        phone={phone}
        saving={saving}
        onChangePhone={setPhone}
        onSave={savePhone}
        onClose={() => setShowPhoneModal(false)}
      />
      {error ? <ErrorState message={error} /> : null}
      {success ? (
        <View style={styles.success}>
          <StatusBadge label="Request submitted" tone="success" />
          <Text style={styles.title}>Your seat request is pending.</Text>
          <Text style={styles.body}>The driver can confirm or decline the request in the driver app.</Text>
          <AppButton title="View my trips" onPress={() => router.replace("/(passenger)/my-trips" as never)} />
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.title}>{ride?.origin} to {ride?.destination}</Text>
          <Text style={styles.body}>{ride?.date} at {ride?.time}</Text>
          <Text style={styles.body}>Seat request for 1 passenger.</Text>
        </View>
          {userError ? (
            <View style={styles.card}>
              <Text style={styles.body}>Sign in before requesting a seat.</Text>
              <AppButton title="Login with email" onPress={() => router.push("/(auth)/email-login" as never)} />
            </View>
          ) : null}
          {!userLoading && user && !user.phone ? (
            <View style={styles.card}>
              <StatusBadge label="Phone required" tone="warning" />
              <Text style={styles.body}>
                Add your phone number to continue. Passengers and drivers need a
                reachable number for pickup coordination and trip safety.
              </Text>
              <AppButton title="Add phone number" variant="secondary" onPress={() => setShowPhoneModal(true)} />
            </View>
          ) : null}
          <AppInput
            label="Message to driver"
            value={note}
            onChangeText={setNote}
            placeholder="Pickup timing, luggage, or special note"
            multiline
          />
          <AppButton title="Confirm request" loading={saving} onPress={submit} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  success: {
    backgroundColor: colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: {
    color: colors.whiteText,
    fontSize: 24,
    fontWeight: "900",
  },
  body: {
    color: colors.mutedText,
    lineHeight: 22,
  },
});
