import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { Avatar } from "../../components/ui/Avatar";
import { AppButton } from "../../components/ui/AppButton";
import { Screen } from "../../components/ui/Screen";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";

export default function ProfileScreen() {
  const router = useRouter();

  return (
    <Screen title="Profile" navRole="passenger">
      <View style={styles.profileCard}>
        <Avatar name="LetsGo Rider" />
        <View style={styles.profileText}>
          <Text style={styles.name}>LetsGo Rider</Text>
          <Text style={styles.meta}>+263 local demo account</Text>
          <Text style={styles.meta}>Harare · Rating 4.8</Text>
        </View>
        <StatusBadge label="Passenger" tone="success" />
      </View>
      <View style={styles.card}>
        <Text style={styles.title}>Role switch</Text>
        <Text style={styles.body}>Use driver mode to post planned trips and review passenger requests.</Text>
        <AppButton title="Switch to driver mode" variant="secondary" onPress={() => router.push("/(driver)/home" as never)} />
      </View>
      <View style={styles.links}>
        <AppButton title="Settings" variant="ghost" onPress={() => router.push("/(shared)/settings" as never)} />
        <AppButton title="Safety Center" variant="ghost" onPress={() => router.push("/(shared)/safety" as never)} />
        <AppButton title="Support" variant="ghost" onPress={() => router.push("/(shared)/support" as never)} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  profileText: {
    flex: 1,
    gap: 3,
  },
  name: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 20,
  },
  meta: {
    color: colors.mutedText,
    fontSize: 13,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 18,
  },
  body: {
    color: colors.mutedText,
    lineHeight: 21,
  },
  links: {
    gap: spacing.sm,
  },
});
