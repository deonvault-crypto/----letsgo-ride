import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppButton } from "../../components/ui/AppButton";
import { AppInput } from "../../components/ui/AppInput";
import { LocationPicker } from "../../components/ui/LocationPicker";
import { Screen } from "../../components/ui/Screen";
import { SeatCounterPicker } from "../../components/ui/SeatCounterPicker";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { TravelDatePicker } from "../../components/ui/TravelDatePicker";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { createRide } from "../../services/ridesService";
import { getMyVerification } from "../../services/verificationService";
import { VerificationProfile } from "../../types/verification.types";
import { isValidTripTime } from "../../utils/formatDate";
import { hasRequiredValues } from "../../utils/validation";
import { isVerifiedStatus } from "../../utils/verificationStatus";

const PROFILE_PHOTO_REQUIRED_MESSAGE = "Please add a clear profile photo before posting rides. This helps passengers know who they are travelling with.";

export default function PostTripScreen() {
  const router = useRouter();
  const { user, loading: userLoading, error: userError } = useCurrentUser();
  const [verification, setVerification] = useState<VerificationProfile | null>(null);
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [durationHours, setDurationHours] = useState("4");
  const [seats, setSeats] = useState(1);
  const [seatPickerOpen, setSeatPickerOpen] = useState(false);
  const [price, setPrice] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

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

  async function submit() {
    if (!user?.phone) {
      setError("Contact support to add or correct the phone number on your verified Driver account.");
      return;
    }
    if (!user?.profile_photo_url) {
      setError(PROFILE_PHOTO_REQUIRED_MESSAGE);
      return;
    }
    if (!verification?.verified || !isVerifiedStatus(verification?.verification_status)) {
      setError("Complete driver verification before posting a trip.");
      return;
    }
    if (!hasRequiredValues([origin, destination, date, time, String(seats), price, vehicle, pickup, dropoff])) {
      setError("Complete every required trip field.");
      return;
    }
    if (!isValidTripTime(time)) {
      setError("Enter a valid 24-hour departure time, for example 14:30.");
      return;
    }
    if (Number(price) <= 0) {
      setError("Enter a valid price per seat.");
      return;
    }
    const estimatedHours = Number(durationHours);
    if (!Number.isFinite(estimatedHours) || estimatedHours <= 0 || estimatedHours > 24) {
      setError("Enter a realistic estimated trip duration.");
      return;
    }
    try {
      setSaving(true);
      const ride = await createRide({
        origin,
        destination,
        date,
        time,
        available_seats: seats,
        price_usd: Number(price),
        estimated_duration_minutes: Math.round(estimatedHours * 60),
        vehicle,
        pickup_note: pickup,
        dropoff_note: dropoff,
        driver_name: user?.name || "LetsGoRide Driver",
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
            Contact support to add or correct the phone number on your verified Driver account. Passengers and drivers need a
            reachable number for pickup coordination and trip safety.
          </Text>
          <AppButton title="Request a contact update" variant="secondary" onPress={() => router.push({ pathname: "/(shared)/support", params: { product: "driver", subject: "Account details change" } } as never)} />
        </View>
      ) : null}
      {user?.phone && !user.profile_photo_url ? (
        <View style={styles.notice}>
          <StatusBadge label="Profile photo required" tone="warning" />
          <Text style={styles.body}>{PROFILE_PHOTO_REQUIRED_MESSAGE}</Text>
          <Text style={styles.helperText}>Use a clear face photo rather than a logo, car, cartoon, or blank image.</Text>
          <AppButton title="Add profile photo" variant="secondary" onPress={() => router.push("/(shared)/edit-profile" as never)} />
        </View>
      ) : null}
      {user?.phone && user.profile_photo_url && !isVerifiedStatus(verification?.verification_status) ? (
        <View style={styles.notice}>
          <StatusBadge label="Verification required" tone="warning" />
          <Text style={styles.body}>
            Drivers must verify their identity and vehicle details before
            posting rides. This helps protect passengers and keeps LetsGoRide
            safer.
          </Text>
          <AppButton title="Open driver verification" variant="secondary" onPress={() => router.push("/(shared)/verification" as never)} />
        </View>
      ) : null}
      {user?.phone && user.profile_photo_url && isVerifiedStatus(verification?.verification_status) ? (
        <View style={styles.notice}>
          <StatusBadge label="Driver verified" tone="success" />
          <Text style={styles.body}>Your account is approved to post public rides.</Text>
        </View>
      ) : null}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Route</Text>
        <LocationPicker label="Origin" value={origin} onChangeText={setOrigin} />
        <LocationPicker label="Destination" value={destination} onChangeText={setDestination} />
      </View>
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Date and time</Text>
        <TravelDatePicker label="Date" value={date} onChangeText={setDate} />
        <AppInput label="Departure time" accessibilityLabel="Time" value={time} onChangeText={setTime} placeholder="14:30" keyboardType="numbers-and-punctuation" />
        <Text style={styles.helperText}>Use 24-hour time, for example 08:15 or 14:30.</Text>
        <AppInput label="Estimated trip duration, hours" accessibilityLabel="Estimated trip duration hours" value={durationHours} onChangeText={setDurationHours} placeholder="4" keyboardType="decimal-pad" />
        <Text style={styles.helperText}>LetsGoRide can archive the trip automatically after the expected arrival time plus a safety buffer.</Text>
      </View>
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Seats and price</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Available seats" onPress={() => setSeatPickerOpen(true)} style={({ pressed }) => [styles.seatField, pressed && styles.pressed]}>
          <View>
            <Text style={styles.fieldLabel}>Seats available</Text>
            <Text style={styles.fieldValue}>{seats} {seats === 1 ? "seat" : "seats"}</Text>
          </View>
          <Text style={styles.changeText}>Change</Text>
        </Pressable>
        <AppInput label="Price per seat, USD" accessibilityLabel="Price USD per seat" value={price} onChangeText={setPrice} keyboardType="number-pad" placeholder="15" />
      </View>
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Vehicle and notes</Text>
        <AppInput label="Vehicle make/model and color" accessibilityLabel="Vehicle" value={vehicle} onChangeText={setVehicle} placeholder="Vehicle make/model, color" />
        <AppInput label="Pickup note" value={pickup} onChangeText={setPickup} placeholder="Exact pickup point and timing" />
        <AppInput label="Drop-off note" value={dropoff} onChangeText={setDropoff} placeholder="Drop-off point or nearby landmark" />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <AppButton title="Publish trip" loading={saving} onPress={submit} />
      <SeatCounterPicker
        visible={seatPickerOpen}
        title="Seats available"
        value={seats}
        min={1}
        max={8}
        helperText="Choose how many seats passengers can book."
        onConfirm={(nextSeats) => {
          setSeats(nextSeats);
          setSeatPickerOpen(false);
        }}
        onClose={() => setSeatPickerOpen(false)}
      />
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
  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 17,
  },
  helperText: {
    color: colors.mutedText,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  seatField: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  pressed: {
    transform: [{ scale: 0.99 }],
  },
  fieldLabel: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: "800",
  },
  fieldValue: {
    color: colors.whiteText,
    fontSize: 16,
    fontWeight: "900",
    marginTop: 4,
  },
  changeText: {
    color: colors.primaryGreen,
    fontWeight: "900",
  },
});
