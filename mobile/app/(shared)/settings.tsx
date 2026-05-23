import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppButton } from "../../components/ui/AppButton";
import { Screen } from "../../components/ui/Screen";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { logout } from "../../services/authService";

export default function SettingsScreen() {
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.replace("/(auth)/welcome" as never);
  }

  return (
    <Screen title="Settings" navRole="passenger">
      <Text style={styles.title}>Settings</Text>
      <View style={styles.card}>
        <Text style={styles.itemTitle}>Account settings</Text>
        <Text style={styles.body}>Manage your passenger and driver account details as LetsGo Ride expands account controls.</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.itemTitle}>Notification preferences</Text>
        <Text style={styles.body}>Ride confirmations, request updates, and support responses will use your account contact details.</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.itemTitle}>Legal</Text>
        <Text style={styles.body}>Terms of Use, Privacy Policy, and Safety Policy apply to passenger and driver activity.</Text>
      </View>
      <AppButton title="Logout" variant="danger" onPress={handleLogout} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 30,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  itemTitle: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 17,
  },
  body: {
    color: colors.mutedText,
    lineHeight: 21,
  },
});
