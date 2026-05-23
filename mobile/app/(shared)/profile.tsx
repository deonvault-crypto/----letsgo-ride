import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { Avatar } from "../../components/ui/Avatar";
import { AppButton } from "../../components/ui/AppButton";
import { Screen } from "../../components/ui/Screen";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { formatStatus } from "../../utils/formatStatus";

export default function ProfileScreen() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const role = user?.role === "driver" ? "driver" : "passenger";
  const displayName = user?.name || "Passenger account";
  const contact = user?.phone || user?.email || "Add phone or email";
  const city = user?.city || "Zimbabwe";

  return (
    <Screen title="Profile" navRole={role}>
      <View style={styles.profileCard}>
        <Avatar name={displayName} />
        <View style={styles.profileText}>
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.meta}>{contact}</Text>
          <Text style={styles.meta}>{city} - {formatStatus(role)} account</Text>
        </View>
        <StatusBadge label={formatStatus(role)} tone="success" />
      </View>
      <View style={styles.card}>
        <Text style={styles.title}>Passenger and driver modes</Text>
        <Text style={styles.body}>
          Passenger mode is for booking seats. Driver mode is for posting trips
          and managing passenger requests.
        </Text>
        <AppButton
          title="Open passenger mode"
          variant="secondary"
          onPress={() => router.push("/(passenger)/home" as never)}
        />
        <AppButton
          title="Open driver mode"
          variant="ghost"
          onPress={() => router.push("/(driver)/home" as never)}
        />
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
