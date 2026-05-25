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
    <Screen title="Safety" showBack fallbackRoute="/(shared)/profile" navRole="passenger">
      <View style={styles.hero}>
        <Text style={styles.title}>Safety Center</Text>
        <Text style={styles.body}>Safety starts with accountable profiles, recorded trip details, and a simple reporting path.</Text>
      </View>
      <SafetyCard title="Driver verification" body="Drivers submit identity and vehicle details for manual review before posting public rides." icon="account-check-outline" />
      <SafetyCard title="Trip records" body="Ride requests and status updates stay visible in My Trips." icon="clipboard-text-clock-outline" />
      <SafetyCard title="Unsafe driving reports" body="Report unsafe driving, scams, payment issues, or passenger problems." icon="alert-outline" />
      <SafetyCard title="Support review" body="Reports are sent to LetsGoRide support for review and follow-up." icon="shield-search" />
      <SafetyCard title="Privacy by design" body="Verification documents are reviewed by LetsGoRide admins only and are not visible to passengers or drivers." icon="lock-check-outline" />
      <SafetyCard title="Emergency guidance" body="For emergencies, contact the appropriate local emergency service first. LetsGoRide does not claim police or government integration." icon="phone-alert-outline" />
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
