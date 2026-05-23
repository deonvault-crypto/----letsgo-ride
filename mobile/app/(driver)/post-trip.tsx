import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppButton } from "../../components/ui/AppButton";
import { AppInput } from "../../components/ui/AppInput";
import { LocationPicker } from "../../components/ui/LocationPicker";
import { ProfileCompletionModal } from "../../components/ui/ProfileCompletionModal";
import { Screen } from "../../components/ui/Screen";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { TravelDatePicker } from "../../components/ui/TravelDatePicker";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { updateCurrentUser } from "../../services/authService";
import { createRide } from "../../services/ridesService";
import { getMyVerification } from "../../services/verificationService";
import { VerificationProfile } from "../../types/verification.types";
import { hasRequiredValues } from "../../utils/validation";

export default function PostTripScreen() {
  const router = useRouter();
  const { user, loading: userLoading, error: userError, reload: reloadUser } = useCurrentUser();
  const [verification, setVerification] = useState<VerificationProfile | null>(null);
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [seats, setSeats] = useState("1");
  const [price, setPrice] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [phone, setPhone] = useState("");
  const [showPhoneModal, setShowPhoneModal] = useState(false);

  useEffect(() => {
    async function loadVerification() {
      try {
        setVerification(await getMyVerification());
      } catch {
        setVerification(null);
      }
    }
    loadVerification();
  }, []);

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

  async function submit() {
    if (!user?.phone) {
      setError("Add your phone number before posting a trip.");
      setShowPhoneModal(true);
      return;
    }
    if (verification?.verification_status !== "verified") {
      setError("Complete driver verification before posting a trip.");
      return;
    }
    if (!hasRequiredValues([origin, destination, date, time, seats, price, vehicle, pickup, dropoff])) {
      setError("Complete every required trip field.");
      return;
    }
    try {
      setSaving(true);
      const ride = await createRide({
        origin,
        destination,
        date,
        time,
        available_seats: Number(seats),
        price_usd: Number(price),
        vehicle,
        pickup_note: pickup,
        dropoff_note: dropoff,
        driver_name: "LetsGo Ride Driver",
        driver_rating: 4.8,
      });
      router.replace(`/(driver)/trip/${ride.id}` as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to post trip.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen navRole="driver">
      <Text style={styles.title}>Post a trip</Text>
      <Text style={styles.body}>Add clear route, seat, price, and vehicle details before accepting passengers.</Text>
      <ProfileCompletionModal
        visible={showPhoneModal}
        phone={phone}
        saving={saving}
        onChangePhone={setPhone}
        onSave={savePhone}
        onClose={() => setShowPhoneModal(false)}
      />
      {userError ? (
        <View style={styles.notice}>
          <Text style={styles.body}>Sign in before posting rides as a driver.</Text>
          <AppButton title="Login with email" onPress={() => router.push("/(auth)/email-login" as never)} />
        </View>
      ) : null}
      {!userLoading && user && !user.phone ? (
        <View style={styles.notice}>
          <StatusBadge label="Phone required" tone="warning" />
          <Text style={styles.body}>
            Add your phone number to continue. Passengers and drivers need a
            reachable number for pickup coordination and trip safety.
          </Text>
          <AppButton title="Add phone number" variant="secondary" onPress={() => setShowPhoneModal(true)} />
        </View>
      ) : null}
      {user?.phone && verification?.verification_status !== "verified" ? (
        <View style={styles.notice}>
          <StatusBadge label="Verification required" tone="warning" />
          <Text style={styles.body}>
            Drivers must verify their identity and vehicle details before
            posting rides. This helps protect passengers and keeps LetsGo Ride
            safer.
          </Text>
          <AppButton title="Open driver verification" variant="secondary" onPress={() => router.push("/(shared)/verification" as never)} />
        </View>
      ) : null}
      {user?.phone && verification?.verification_status === "verified" ? (
        <View style={styles.notice}>
          <StatusBadge label="Driver verified" tone="success" />
          <Text style={styles.body}>Your account is approved to post public rides.</Text>
        </View>
      ) : null}
      <LocationPicker label="Origin" value={origin} onChangeText={setOrigin} />
      <LocationPicker label="Destination" value={destination} onChangeText={setDestination} />
      <TravelDatePicker label="Date" value={date} onChangeText={setDate} />
      <AppInput label="Time" value={time} onChangeText={setTime} />
      <AppInput label="Available seats" value={seats} onChangeText={setSeats} keyboardType="number-pad" />
      <AppInput label="Price USD per seat" value={price} onChangeText={setPrice} keyboardType="number-pad" />
      <AppInput label="Vehicle" value={vehicle} onChangeText={setVehicle} />
      <AppInput label="Pickup note" value={pickup} onChangeText={setPickup} />
      <AppInput label="Drop-off note" value={dropoff} onChangeText={setDropoff} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <AppButton title="Publish trip" loading={saving} onPress={submit} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 31,
  },
  body: {
    color: colors.mutedText,
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
  error: {
    color: colors.danger,
    fontWeight: "700",
  },
  notice: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
});
