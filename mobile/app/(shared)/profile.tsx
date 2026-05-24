import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { Avatar } from "../../components/ui/Avatar";
import { AppButton } from "../../components/ui/AppButton";
import { ListTile } from "../../components/ui/ListTile";
import { Screen } from "../../components/ui/Screen";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { VerifiedBadge, isIdentityVerified } from "../../components/ui/VerifiedBadge";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { displayNameOrFallback, firstNameOrFallback } from "../../utils/displayName";
import { formatStatus } from "../../utils/formatStatus";

export default function ProfileScreen() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const role = user?.role === "driver" ? "driver" : "passenger";
  const displayName = displayNameOrFallback(user?.name);
  const firstName = firstNameOrFallback(user?.name);
  const contact = user?.phone || user?.email || "Add phone or email";
  const city = user?.city || "Zimbabwe";
  const verified = isIdentityVerified(user);

  return (
    <Screen navRole={role}>
      <View style={styles.profileCard}>
        <Avatar name={displayName} imageUri={user?.profile_photo_url} size={64} />
        <View style={styles.profileText}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>Hi, {firstName}</Text>
            <VerifiedBadge verified={verified} size="medium" />
          </View>
          <Text style={styles.meta}>{contact}</Text>
          <Text style={styles.meta}>{city}</Text>
        </View>
        <StatusBadge label={user?.role === "admin" ? "Admin" : formatStatus(role)} tone={user?.role === "admin" ? "neutral" : "success"} />
      </View>

      {!verified ? (
        <View style={styles.card}>
          <Text style={styles.title}>Get verified</Text>
          <Text style={styles.body}>
            Verification builds trust. A verified badge helps other people know
            your account is real and reviewed by LetsGoRide.
          </Text>
          <AppButton title="Start verification" onPress={() => router.push("/(shared)/verification" as never)} />
        </View>
      ) : null}

      <View style={styles.section}>
        {user?.role === "admin" ? (
          <ListTile icon="view-dashboard-outline" title="Admin dashboard" subtitle="Users, rides, reports, support, and driver verification" onPress={() => router.replace("/(admin)/dashboard" as never)} />
        ) : null}
        <ListTile icon="account-edit-outline" title="Edit profile" subtitle="Name, photo, phone, city, and travel preferences" onPress={() => router.push("/(shared)/edit-profile" as never)} />
        <ListTile icon="shield-check-outline" title="Driver verification" subtitle="Verify your identity before posting rides" onPress={() => router.push("/(shared)/verification" as never)} />
        <ListTile icon="cog-outline" title="Settings" subtitle="Account, privacy, and app preferences" onPress={() => router.push("/(shared)/settings" as never)} />
        <ListTile icon="shield-alert-outline" title="Safety Center" subtitle="Report issues and review trip safety" onPress={() => router.push("/(shared)/safety" as never)} />
        <ListTile icon="lifebuoy" title="Support" subtitle="Contact LetsGoRide support" onPress={() => router.push("/(shared)/support" as never)} />
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Passenger and driver modes</Text>
        <Text style={styles.body}>
          Passenger mode is for booking seats. Driver mode is for posting trips
          and managing passenger requests.
        </Text>
        <AppButton title="Open passenger mode" variant="secondary" onPress={() => router.replace("/(passenger)/home" as never)} />
        <AppButton title="Open driver mode" variant="ghost" onPress={() => router.replace("/(driver)/home" as never)} />
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
    borderRadius: 26,
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
    fontSize: 22,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexWrap: "wrap",
  },
  meta: {
    color: colors.mutedText,
    fontSize: 13,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 26,
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
  section: {
    gap: spacing.sm,
  },
});
