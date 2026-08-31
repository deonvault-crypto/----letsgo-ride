import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppButton } from "../../components/ui/AppButton";
import { AppInput } from "../../components/ui/AppInput";
import { LocationPicker } from "../../components/ui/LocationPicker";
import { Screen } from "../../components/ui/Screen";
import { SeatCounterPicker } from "../../components/ui/SeatCounterPicker";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { TravelDatePicker } from "../../components/ui/TravelDatePicker";
import { v2Theme } from "../../constants/v2Theme";
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

  const verified = Boolean(user?.phone && user.profile_photo_url && isVerifiedStatus(verification?.verification_status));

  return (
    <Screen navRole="driver" title="Post trip">
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>SHARE A ROUTE</Text>
        <Text style={styles.title}>Where are you driving?</Text>
        <Text style={styles.body}>Build the journey first. Seats, price and vehicle details follow the route.</Text>
      </View>

      {userError ? (
        <View style={styles.notice}>
          <Text style={styles.noticeBody}>Sign in before posting rides as a driver.</Text>
          <AppButton title="Login with email" onPress={() => router.push("/(auth)/email-login" as never)} />
        </View>
      ) : null}
      {!userLoading && user && !user.phone ? (
        <View style={styles.notice}>
          <StatusBadge label="Phone required" tone="warning" />
          <Text style={styles.noticeBody}>Contact support to add or correct the phone number on your verified Driver account. Passengers and drivers need a reachable number for pickup coordination and trip safety.</Text>
          <AppButton title="Request a contact update" variant="secondary" onPress={() => router.push({ pathname: "/(shared)/support", params: { product: "driver", subject: "Account details change" } } as never)} />
        </View>
      ) : null}
      {user?.phone && !user.profile_photo_url ? (
        <View style={styles.notice}>
          <StatusBadge label="Profile photo required" tone="warning" />
          <Text style={styles.noticeBody}>{PROFILE_PHOTO_REQUIRED_MESSAGE}</Text>
          <Text style={styles.helperText}>Use a clear face photo rather than a logo, car, cartoon, or blank image.</Text>
          <AppButton title="Add profile photo" variant="secondary" onPress={() => router.push("/(shared)/edit-profile" as never)} />
        </View>
      ) : null}
      {user?.phone && user.profile_photo_url && !isVerifiedStatus(verification?.verification_status) ? (
        <View style={styles.notice}>
          <StatusBadge label="Verification required" tone="warning" />
          <Text style={styles.noticeBody}>Drivers must verify their identity and vehicle details before posting rides. This helps protect passengers and keeps LetsGoRide safer.</Text>
          <AppButton title="Open driver verification" variant="secondary" onPress={() => router.push("/(shared)/verification" as never)} />
        </View>
      ) : null}
      {verified ? (
        <View style={styles.verifiedLine}>
          <MaterialCommunityIcons name="shield-check" size={18} color={v2Theme.colors.brandStrong} />
          <View style={styles.flex}>
            <Text style={styles.verifiedTitle}>Driver verified</Text>
            <Text style={styles.verifiedBody}>Approved to publish public rides.</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.routePreview}>
        <View style={styles.routeRail}>
          <View style={styles.originDot} />
          <View style={styles.routeLine} />
          <View style={styles.destinationDot} />
        </View>
        <View style={styles.routePreviewCopy}>
          <View style={styles.previewStop}>
            <Text style={styles.previewLabel}>FROM</Text>
            <Text numberOfLines={1} style={[styles.previewValue, !origin && styles.previewPlaceholder]}>{origin || "Choose origin"}</Text>
          </View>
          <View style={styles.previewStop}>
            <Text style={styles.previewLabel}>TO</Text>
            <Text numberOfLines={1} style={[styles.previewValue, !destination && styles.previewPlaceholder]}>{destination || "Choose destination"}</Text>
          </View>
        </View>
      </View>

      <View style={styles.builder}>
        <BuilderSection number="01" title="Route">
          <LocationPicker label="Origin" value={origin} onChangeText={setOrigin} />
          <LocationPicker label="Destination" value={destination} onChangeText={setDestination} />
        </BuilderSection>

        <View style={styles.divider} />

        <BuilderSection number="02" title="Departure">
          <TravelDatePicker label="Date" value={date} onChangeText={setDate} />
          <View style={styles.twoColumn}>
            <View style={styles.flex}>
              <AppInput label="Departure time" accessibilityLabel="Time" value={time} onChangeText={setTime} placeholder="14:30" keyboardType="numbers-and-punctuation" />
            </View>
            <View style={styles.flex}>
              <AppInput label="Trip duration, hours" accessibilityLabel="Estimated trip duration hours" value={durationHours} onChangeText={setDurationHours} placeholder="4" keyboardType="decimal-pad" />
            </View>
          </View>
          <Text style={styles.helperText}>Use 24-hour time. LetsGoRide uses the trip duration to keep the route lifecycle accurate.</Text>
        </BuilderSection>

        <View style={styles.divider} />

        <BuilderSection number="03" title="Seats & fare">
          <View style={styles.twoColumn}>
            <Pressable accessibilityRole="button" accessibilityLabel="Available seats" onPress={() => setSeatPickerOpen(true)} style={({ pressed }) => [styles.seatField, pressed && styles.pressed]}>
              <Text style={styles.fieldLabel}>SEATS</Text>
              <Text style={styles.fieldValue}>{seats}</Text>
              <Text style={styles.changeText}>Change</Text>
            </Pressable>
            <View style={styles.flex}>
              <AppInput label="Price per seat, USD" accessibilityLabel="Price USD per seat" value={price} onChangeText={setPrice} keyboardType="number-pad" placeholder="15" />
            </View>
          </View>
        </BuilderSection>

        <View style={styles.divider} />

        <BuilderSection number="04" title="Car & meeting points">
          <AppInput label="Vehicle make/model and color" accessibilityLabel="Vehicle" value={vehicle} onChangeText={setVehicle} placeholder="Vehicle make/model, color" />
          <AppInput label="Pickup note" value={pickup} onChangeText={setPickup} placeholder="Exact pickup point and timing" />
          <AppInput label="Drop-off note" value={dropoff} onChangeText={setDropoff} placeholder="Drop-off point or nearby landmark" />
        </BuilderSection>
      </View>

      {error ? (
        <View style={styles.errorLine}>
          <MaterialCommunityIcons name="alert-circle-outline" size={19} color={v2Theme.colors.danger} />
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : null}

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

function BuilderSection({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return (
    <View style={styles.builderSection}>
      <View style={styles.builderHeading}>
        <Text style={styles.sectionNumber}>{number}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.sectionFields}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { gap: 6, paddingBottom: 2 },
  eyebrow: { color: v2Theme.colors.brandStrong, fontSize: 9, fontWeight: "900", letterSpacing: 1.25 },
  title: { color: v2Theme.colors.ink, fontWeight: "900", fontSize: 31, lineHeight: 35, letterSpacing: -1 },
  body: { color: v2Theme.colors.inkSecondary, fontSize: 12, lineHeight: 18, maxWidth: 330 },
  notice: { backgroundColor: v2Theme.colors.surface, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, padding: 14, gap: 10 },
  noticeBody: { color: v2Theme.colors.inkSecondary, fontSize: 11, lineHeight: 17 },
  verifiedLine: { minHeight: 58, borderRadius: 20, backgroundColor: v2Theme.colors.brandSofter, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 10 },
  verifiedTitle: { color: v2Theme.colors.ink, fontSize: 11, fontWeight: "900" },
  verifiedBody: { color: v2Theme.colors.inkSecondary, fontSize: 9, marginTop: 2 },
  routePreview: { minHeight: 128, borderRadius: 27, backgroundColor: v2Theme.colors.ink, padding: 17, flexDirection: "row", gap: 14, shadowColor: v2Theme.colors.shadow, shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  routeRail: { width: 20, alignItems: "center", paddingVertical: 6 },
  originDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 3, borderColor: "#FFFFFF", backgroundColor: v2Theme.colors.ink },
  routeLine: { width: 2, flex: 1, marginVertical: 5, backgroundColor: "rgba(255,255,255,0.28)" },
  destinationDot: { width: 11, height: 11, borderRadius: 3, backgroundColor: "#FFFFFF" },
  routePreviewCopy: { flex: 1, justifyContent: "space-between", paddingVertical: 1 },
  previewStop: { gap: 3 },
  previewLabel: { color: "rgba(255,255,255,0.48)", fontSize: 8, fontWeight: "900", letterSpacing: 1.1 },
  previewValue: { color: "#FFFFFF", fontSize: 17, lineHeight: 21, fontWeight: "900", letterSpacing: -0.35 },
  previewPlaceholder: { color: "rgba(255,255,255,0.56)" },
  builder: { borderRadius: 28, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, paddingHorizontal: 15, overflow: "hidden" },
  builderSection: { paddingVertical: 17, gap: 13 },
  builderHeading: { flexDirection: "row", alignItems: "center", gap: 9 },
  sectionNumber: { color: v2Theme.colors.brandStrong, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  sectionTitle: { color: v2Theme.colors.ink, fontWeight: "900", fontSize: 16, letterSpacing: -0.2 },
  sectionFields: { gap: 11 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: v2Theme.colors.line },
  twoColumn: { flexDirection: "row", gap: 9, alignItems: "stretch" },
  helperText: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14, fontWeight: "700" },
  seatField: { flex: 1, minHeight: 78, borderRadius: 18, backgroundColor: v2Theme.colors.surfaceMuted, padding: 12, justifyContent: "center" },
  fieldLabel: { color: v2Theme.colors.inkTertiary, fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  fieldValue: { color: v2Theme.colors.ink, fontSize: 25, lineHeight: 29, fontWeight: "900", marginTop: 2 },
  changeText: { color: v2Theme.colors.brandStrong, fontSize: 9, fontWeight: "900", marginTop: 1 },
  errorLine: { borderRadius: 18, backgroundColor: v2Theme.colors.dangerSoft, padding: 12, flexDirection: "row", alignItems: "flex-start", gap: 9 },
  error: { flex: 1, color: v2Theme.colors.danger, fontSize: 10, lineHeight: 16, fontWeight: "800" },
  pressed: { opacity: 0.75, transform: [{ scale: 0.995 }] },
});
