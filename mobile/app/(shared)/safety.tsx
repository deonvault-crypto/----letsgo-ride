import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { SafetyCard } from "../../components/cards/SafetyCard";
import { AppButton } from "../../components/ui/AppButton";
import { Screen } from "../../components/ui/Screen";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";

export default function SafetyScreen() {
  const router = useRouter();

  return (
    <Screen title="Safety" navRole="passenger">
      <View style={styles.hero}>
        <Text style={styles.title}>Safety Center</Text>
        <Text style={styles.body}>Safety starts with clear trip details, accountable profiles, and a simple reporting path.</Text>
      </View>
      <SafetyCard title="Driver verification" body="Driver profiles can show verified status once review flows are active." icon="account-check-outline" />
      <SafetyCard title="Trip records" body="Ride requests and status updates stay visible in My Trips." icon="clipboard-text-clock-outline" />
      <SafetyCard title="Unsafe driving reports" body="Report unsafe driving, scams, payment issues, or passenger problems." icon="alert-outline" />
      <SafetyCard title="Support review" body="Reports are sent to LetsGo Ride support for review and follow-up." icon="shield-search" />
      <SafetyCard title="Emergency guidance" body="For emergencies, contact the appropriate local emergency service first." icon="phone-alert-outline" />
      <AppButton title="Report an issue" onPress={() => router.push("/(shared)/report" as never)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.card,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 30,
  },
  body: {
    color: colors.mutedText,
    lineHeight: 22,
  },
});
