import { StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { AppButton } from "../ui/AppButton";

export function RouteSearchCard({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.card}>
      <View style={styles.icon}>
        <MaterialCommunityIcons name="map-search-outline" size={25} color={colors.primaryGreen} />
      </View>
      <Text style={styles.title}>Find a verified ride</Text>
      <Text style={styles.copy}>
        Search intercity seats, city rides, and errands with clear pickup and drop-off notes.
      </Text>
      <AppButton title="Search routes" onPress={onPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 26,
    padding: spacing.xl,
    gap: spacing.md,
  },
  icon: {
    width: 50,
    height: 50,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(29,185,84,0.12)",
  },
  title: {
    color: colors.whiteText,
    fontSize: 22,
    fontWeight: "900",
  },
  copy: {
    color: colors.mutedText,
    lineHeight: 21,
  },
});
