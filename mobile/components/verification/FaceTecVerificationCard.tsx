import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { AppButton } from "../ui/AppButton";
import { StatusBadge } from "../ui/StatusBadge";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { isFaceTecNativeAvailable } from "../../services/facetecService";

type FaceTecVerificationCardProps = {
  loading?: boolean;
  onStart: () => void;
  onUseManual: () => void;
};

export function FaceTecVerificationCard({
  loading,
  onStart,
  onUseManual,
}: FaceTecVerificationCardProps) {
  const available = isFaceTecNativeAvailable();

  return (
    <View style={styles.card}>
      <View style={styles.iconCircle}>
        <MaterialCommunityIcons name="face-recognition" size={24} color={colors.primaryGreen} />
      </View>
      <View style={styles.copy}>
        <View style={styles.badgeRow}>
          <StatusBadge label={available ? "Fast verification" : "Manual review available"} tone={available ? "success" : "warning"} />
        </View>
        <Text style={styles.title}>Verify with FaceTec</Text>
        <Text style={styles.body}>
          Scan your face and driver document in a guided 3D check. LetsGoRide
          only uses this during verification and sends edge cases to manual
          review.
        </Text>
      </View>
      <AppButton
        title={available ? "Start biometric check" : "Biometric check unavailable"}
        loading={loading}
        disabled={!available}
        onPress={onStart}
      />
      <AppButton
        title="Use manual document review"
        variant="secondary"
        disabled={loading}
        onPress={onUseManual}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  iconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(17,139,68,0.1)",
  },
  copy: {
    gap: spacing.sm,
  },
  badgeRow: {
    alignSelf: "flex-start",
  },
  title: {
    color: colors.whiteText,
    fontSize: 20,
    fontWeight: "900",
  },
  body: {
    color: colors.mutedText,
    lineHeight: 22,
  },
});
