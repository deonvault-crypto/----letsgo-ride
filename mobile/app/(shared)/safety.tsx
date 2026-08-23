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
    <Screen title="Safety" showBack fallbackRoute="/(shared)/account" navRole="customer">
      <View style={styles.hero}>
        <Text style={styles.title}>Safety Center</Text>
        <Text style={styles.body}>Safety across Ride, Food and Courier starts with accountable profiles, recorded activity, secure handoffs, and a clear reporting path.</Text>
      </View>
      <SafetyCard title="Verified work accounts" body="Drivers, couriers and merchants use separate work identities with their own approval and operating requirements." icon="account-check-outline" />
      <SafetyCard title="Recorded activity" body="Ride requests, food orders and courier delivery updates remain visible in your activity history." icon="clipboard-text-clock-outline" />
      <SafetyCard title="Secure delivery handoff" body="Courier and food deliveries can require the recipient’s 4-digit handoff code at the saved destination." icon="shield-key-outline" />
      <SafetyCard title="Report problems" body="Report unsafe driving, scams, payment issues, delivery problems, or account concerns to LetsGoRide support." icon="alert-outline" />
      <SafetyCard title="Privacy by design" body="Verification information is reviewed by authorized LetsGoRide operations staff and is not shown publicly." icon="lock-check-outline" />
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
