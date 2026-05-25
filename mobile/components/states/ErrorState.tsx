import { StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { AppButton } from "../ui/AppButton";

export function ErrorState({
  title = "Unable to load data",
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.state}>
      <View style={styles.iconWrap}>
        <MaterialCommunityIcons name="alert-circle-outline" size={28} color={colors.warning} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{message}</Text>
      {onRetry ? <AppButton title="Retry" variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  state: {
    minHeight: 172,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.xl,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,176,32,0.12)",
  },
  title: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 18,
  },
  body: {
    color: colors.mutedText,
    textAlign: "center",
    lineHeight: 20,
  },
});
