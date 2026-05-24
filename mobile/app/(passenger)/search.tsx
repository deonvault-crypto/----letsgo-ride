import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppButton } from "../../components/ui/AppButton";
import { LocationPicker } from "../../components/ui/LocationPicker";
import { PopularRouteChips } from "../../components/ui/PopularRouteChips";
import { Screen } from "../../components/ui/Screen";
import { SeatCounterPicker } from "../../components/ui/SeatCounterPicker";
import { TravelDatePicker } from "../../components/ui/TravelDatePicker";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";

export default function SearchRideScreen() {
  const router = useRouter();
  const [origin, setOrigin] = useState("Harare");
  const [destination, setDestination] = useState("Bulawayo");
  const [date, setDate] = useState("");
  const [seats, setSeats] = useState(1);
  const [seatPickerOpen, setSeatPickerOpen] = useState(false);

  function submit() {
    router.push({
      pathname: "/(passenger)/results",
      params: { origin, destination, date, seats: String(seats) },
    } as never);
  }

  return (
    <Screen navRole="passenger">
      <Text style={styles.title}>Search rides</Text>
      <View style={styles.form}>
        <LocationPicker label="Origin" value={origin} onChangeText={setOrigin} placeholder="Harare" />
        <LocationPicker label="Destination" value={destination} onChangeText={setDestination} placeholder="Bulawayo" />
        <TravelDatePicker label="Travel date" value={date} onChangeText={setDate} />
        <Pressable accessibilityRole="button" accessibilityLabel="Seats" onPress={() => setSeatPickerOpen(true)} style={({ pressed }) => [styles.seatField, pressed && styles.pressed]}>
          <View>
            <Text style={styles.fieldLabel}>Seats</Text>
            <Text style={styles.fieldValue}>{seats} {seats === 1 ? "seat" : "seats"}</Text>
          </View>
          <Text style={styles.changeText}>Change</Text>
        </Pressable>
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Popular routes</Text>
        <PopularRouteChips
          onSelect={(routeOrigin, routeDestination) => {
            setOrigin(routeOrigin);
            setDestination(routeDestination);
          }}
        />
      </View>
      <AppButton title="Search rides" onPress={submit} />
      <SeatCounterPicker
        visible={seatPickerOpen}
        title="Seats needed"
        value={seats}
        min={1}
        max={6}
        helperText="Choose how many seats you want to reserve."
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
    fontSize: 32,
  },
  form: {
    gap: spacing.md,
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
  section: {
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 17,
  },
});
