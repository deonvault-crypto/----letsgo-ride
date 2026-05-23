import { StyleSheet, Text, View } from "react-native";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { AppButton } from "../ui/AppButton";

export function RouteSearchCard({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Search rides</Text>
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
  title: {
    color: colors.whiteText,
    fontSize: 20,
    fontWeight: "900",
  },
});
