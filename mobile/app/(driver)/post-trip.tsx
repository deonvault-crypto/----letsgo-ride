import { useState } from "react";
import { StyleSheet, Text } from "react-native";
import { useRouter } from "expo-router";

import { AppButton } from "../../components/ui/AppButton";
import { AppInput } from "../../components/ui/AppInput";
import { Screen } from "../../components/ui/Screen";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { createRide } from "../../services/ridesService";
import { hasRequiredValues } from "../../utils/validation";

export default function PostTripScreen() {
  const router = useRouter();
  const [origin, setOrigin] = useState("Harare");
  const [destination, setDestination] = useState("Bulawayo");
  const [date, setDate] = useState("2026-06-03");
  const [time, setTime] = useState("07:30");
  const [seats, setSeats] = useState("3");
  const [price, setPrice] = useState("12");
  const [vehicle, setVehicle] = useState("Toyota Wish, silver");
  const [pickup, setPickup] = useState("Harare CBD, Fourth Street pickup point");
  const [dropoff, setDropoff] = useState("Bulawayo City Hall");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
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
    <Screen title="Post" navRole="driver">
      <Text style={styles.title}>Post a trip</Text>
      <Text style={styles.body}>Add clear route, seat, price, and vehicle details before accepting passengers.</Text>
      <AppInput label="Origin" value={origin} onChangeText={setOrigin} />
      <AppInput label="Destination" value={destination} onChangeText={setDestination} />
      <AppInput label="Date" value={date} onChangeText={setDate} />
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
});
