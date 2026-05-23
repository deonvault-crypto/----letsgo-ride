import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppButton } from "../../components/ui/AppButton";
import { AppInput } from "../../components/ui/AppInput";
import { Screen } from "../../components/ui/Screen";
import { colors } from "../../constants/colors";
import { routeCities, zimbabweRoutes } from "../../constants/routes";
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
    <Screen title="Search" navRole="passenger">
      <Text style={styles.title}>Search rides</Text>
      <View style={styles.form}>
        <AppInput label="Origin" value={origin} onChangeText={setOrigin} placeholder="Harare" />
        <AppInput label="Destination" value={destination} onChangeText={setDestination} placeholder="Bulawayo" />
        <AppInput label="Travel date" value={date} onChangeText={setDate} placeholder="2026-06-03" />
        <AppInput label="Seats" value={seats} onChangeText={setSeats} keyboardType="number-pad" placeholder="1" />
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Smart suggestions</Text>
        <View style={styles.chips}>
          {routeCities.map((city) => (
            <Pressable key={city} onPress={() => (!origin ? setOrigin(city) : setDestination(city))} style={styles.chip}>
              <Text style={styles.chipText}>{city}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Serious launch routes</Text>
        {zimbabweRoutes.slice(0, 5).map((route) => (
          <Pressable
            key={`${route.origin}-${route.destination}`}
            style={styles.routeRow}
            onPress={() => {
              setOrigin(route.origin);
              setDestination(route.destination);
            }}
          >
            <Text style={styles.routeText}>{route.origin} to {route.destination}</Text>
          </Pressable>
        ))}
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
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: {
    color: colors.whiteText,
    fontWeight: "800",
  },
  routeRow: {
    padding: spacing.lg,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  routeText: {
    color: colors.whiteText,
    fontWeight: "800",
  },
});
