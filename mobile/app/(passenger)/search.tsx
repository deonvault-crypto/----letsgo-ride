import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppButton } from "../../components/ui/AppButton";
import { AppInput } from "../../components/ui/AppInput";
import { LocationPicker } from "../../components/ui/LocationPicker";
import { PopularRouteChips } from "../../components/ui/PopularRouteChips";
import { Screen } from "../../components/ui/Screen";
import { TravelDatePicker } from "../../components/ui/TravelDatePicker";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";

export default function SearchRideScreen() {
  const router = useRouter();
  const [origin, setOrigin] = useState("Harare");
  const [destination, setDestination] = useState("Bulawayo");
  const [date, setDate] = useState("");
  const [seats, setSeats] = useState("1");

  function submit() {
    router.push({
      pathname: "/(passenger)/results",
      params: { origin, destination, date, seats },
    } as never);
  }

  return (
    <Screen navRole="passenger">
      <Text style={styles.title}>Search rides</Text>
      <View style={styles.form}>
        <LocationPicker label="Origin" value={origin} onChangeText={setOrigin} placeholder="Harare" />
        <LocationPicker label="Destination" value={destination} onChangeText={setDestination} placeholder="Bulawayo" />
        <TravelDatePicker label="Travel date" value={date} onChangeText={setDate} />
        <AppInput label="Seats" value={seats} onChangeText={setSeats} keyboardType="number-pad" placeholder="1" />
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
  section: {
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 17,
  },
});
