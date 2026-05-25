import { StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { AppButton } from "../ui/AppButton";

export function RouteSearchCard({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.iconWrap}>
          <MaterialCommunityIcons name="map-search-outline" size={24} color={colors.primaryGreen} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>Search rides</Text>
          <Text style={styles.body}>Choose your route, travel date, and seats.</Text>
        </View>
      </View>
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
    padding: spacing.lg,
    gap: spacing.md,
    shadowColor: colors.black,
    shadowOpacity: 0.04,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  iconWrap: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(17,139,68,0.1)",
  },
  copy: {
    flex: 1,
    gap: 3,
  },
  title: {
    color: colors.whiteText,
    fontSize: 19,
    fontWeight: "900",
  },
  body: {
    color: colors.mutedText,
    fontSize: 13,
    lineHeight: 18,
  },
});
