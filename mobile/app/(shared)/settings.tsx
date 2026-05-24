import { Alert, StyleSheet, Switch, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ReactNode } from "react";

import { ListTile } from "../../components/ui/ListTile";
import { Screen } from "../../components/ui/Screen";
import { colors } from "../../constants/colors";
import { legalUrls } from "../../constants/legal";
import { spacing } from "../../constants/spacing";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { deleteAccount, logout, updateCurrentUser } from "../../services/authService";
import { formatStatus } from "../../utils/formatStatus";
import { openExternalUrl } from "../../utils/openExternalUrl";

type PreferenceKey =
  | "notification_trip_updates"
  | "notification_booking_requests"
  | "notification_support_replies"
  | "notification_safety_alerts"
  | "notification_marketing";

const preferenceRows: Array<{ key: PreferenceKey; title: string; subtitle: string; defaultValue: boolean }> = [
  {
    key: "notification_trip_updates",
    title: "Trip updates",
    subtitle: "Ride status and trip record updates.",
    defaultValue: true,
  },
  {
    key: "notification_booking_requests",
    title: "Booking requests",
    subtitle: "Seat request and driver response updates.",
    defaultValue: true,
  },
  {
    key: "notification_support_replies",
    title: "Support replies",
    subtitle: "Updates from LetsGoRide support.",
    defaultValue: true,
  },
  {
    key: "notification_safety_alerts",
    title: "Safety alerts",
    subtitle: "Important account and trip safety notices.",
    defaultValue: true,
  },
  {
    key: "notification_marketing",
    title: "Marketing messages",
    subtitle: "Occasional product and route updates.",
    defaultValue: false,
  },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { user, reload } = useCurrentUser();
  const role = user?.role === "driver" ? "driver" : "passenger";
  const verificationStatus = user?.verification_status || "not_started";

  async function updatePreference(key: PreferenceKey, value: boolean) {
    await updateCurrentUser({ [key]: value });
    await reload();
  }

  function confirmLogout() {
    Alert.alert("Logout", "You will be signed out of this LetsGoRide account.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/(auth)/welcome" as never);
        },
      },
    ]);
  }

  function confirmDeleteAccount() {
    Alert.alert(
      "Request account deletion",
      "Your account will be marked for deletion. Some trip and safety records may be retained where legally or operationally required.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: async () => {
            await deleteAccount();
            Alert.alert("Account deletion requested", "Your LetsGoRide account has been updated.");
            router.replace("/(auth)/welcome" as never);
          },
        },
      ],
    );
  }

  function explainVerifiedBadge() {
    Alert.alert(
      "Verified identity badge",
      "A blue verified badge means the person completed LetsGoRide identity verification. It helps passengers and drivers know the account is real and reviewed by LetsGoRide.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: verificationStatus === "verified" ? "View status" : "Start verification",
          onPress: () => router.push("/(shared)/verification" as never),
        },
      ],
    );
  }

  return (
    <Screen title="Settings" showBack fallbackRoute="/(shared)/profile" navRole={role}>
      <View style={styles.headerCopy}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.body}>Manage your account, privacy, and LetsGoRide update preferences.</Text>
      </View>

      <Section title="Account">
        <ListTile
          icon="account-edit-outline"
          title="Edit profile"
          subtitle="Name, photo, phone, city, and travel preferences"
          onPress={() => router.push("/(shared)/edit-profile" as never)}
        />
        <ListTile
          icon="cellphone"
          title="Change phone number"
          subtitle="Use country code format, for example +263772554186"
          onPress={() => router.push("/(shared)/edit-profile" as never)}
        />
        <ListTile
          icon="account-switch-outline"
          title="Manage passenger and driver mode"
          subtitle="Open the app section that matches how you are travelling"
          onPress={() => router.replace(role === "driver" ? "/(passenger)/home" as never : "/(driver)/home" as never)}
        />
        <ListTile
          icon="shield-check-outline"
          title="Driver verification status"
          subtitle={formatStatus(verificationStatus)}
          onPress={() => router.push("/(shared)/verification" as never)}
        />
      </Section>

      <Section title="Notifications" subtitle="Choose which updates LetsGoRide should send you.">
        {preferenceRows.map((row) => {
          const value = user?.[row.key] ?? row.defaultValue;
          return (
            <View key={row.key} style={styles.toggleRow}>
              <View style={styles.toggleCopy}>
                <Text style={styles.toggleTitle}>{row.title}</Text>
                <Text style={styles.toggleSubtitle}>{row.subtitle}</Text>
              </View>
              <Switch
                value={value}
                onValueChange={(next) => updatePreference(row.key, next)}
                trackColor={{ false: "#D9D0C3", true: "rgba(17,139,68,0.36)" }}
                thumbColor={value ? colors.primaryGreen : "#FFFDF8"}
              />
            </View>
          );
        })}
      </Section>

      <Section title="Privacy and safety">
        <View style={styles.explainerCard}>
          <Text style={styles.explainerTitle}>Phone and document privacy</Text>
          <Text style={styles.body}>
            Your phone number is not shown publicly in ride browsing. It is
            only shared when needed for confirmed trip coordination. Admin may
            access contact details for safety and support. Verification
            documents are not visible to passengers or other normal users.
          </Text>
        </View>
        <ListTile
          icon="check-decagram-outline"
          title="Verified identity badge"
          subtitle="Build trust with other passengers and drivers"
          onPress={explainVerifiedBadge}
        />
        <ListTile
          icon="lifebuoy"
          title="Support"
          subtitle="Contact LetsGoRide support"
          onPress={() => router.push("/(shared)/support" as never)}
        />
        <ListTile
          icon="shield-alert-outline"
          title="Safety Center"
          subtitle="Report issues and review trip safety"
          onPress={() => router.push("/(shared)/safety" as never)}
        />
      </Section>

      <Section title="Legal">
        <ListTile icon="lock-outline" title="Privacy Policy" onPress={() => openExternalUrl(legalUrls.privacy)} />
        <ListTile icon="file-document-outline" title="Terms of Use" onPress={() => openExternalUrl(legalUrls.terms)} />
        <ListTile icon="shield-outline" title="Safety Policy" onPress={() => router.push("/(shared)/safety" as never)} />
      </Section>

      <Section title="Account control">
        <ListTile
          icon="logout"
          title="Logout"
          subtitle="Sign out and clear this account from the device"
          onPress={confirmLogout}
          danger
        />
        <ListTile
          icon="delete-outline"
          title="Request account deletion"
          subtitle="Delete your LetsGoRide account"
          onPress={confirmDeleteAccount}
          danger
        />
      </Section>
    </Screen>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  headerCopy: {
    gap: spacing.sm,
  },
  title: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 30,
  },
  body: {
    color: colors.mutedText,
    lineHeight: 21,
  },
  section: {
    gap: spacing.sm,
  },
  sectionHeader: {
    gap: 3,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    color: colors.whiteText,
    fontSize: 18,
    fontWeight: "900",
  },
  sectionSubtitle: {
    color: colors.mutedText,
    fontSize: 13,
    lineHeight: 18,
  },
  toggleRow: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
  },
  toggleCopy: {
    flex: 1,
    gap: 3,
  },
  toggleTitle: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 15,
  },
  toggleSubtitle: {
    color: colors.mutedText,
    fontSize: 12,
    lineHeight: 17,
  },
  explainerCard: {
    padding: spacing.lg,
    gap: spacing.sm,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#FFFBF3",
  },
  explainerTitle: {
    color: colors.whiteText,
    fontWeight: "900",
  },
});
