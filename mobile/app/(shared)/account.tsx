import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect } from "react";

import { AccountDetailsSummary } from "../../components/account/AccountDetailsSummary";
import { AccountComplianceSections } from "../../components/account/AccountComplianceSections";
import { Avatar } from "../../components/ui/Avatar";
import { Screen } from "../../components/ui/Screen";
import { VerifiedBadge, isIdentityVerified } from "../../components/ui/VerifiedBadge";
import { v2Theme } from "../../constants/v2Theme";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { displayNameOrFallback } from "../../utils/displayName";
import { isPendingVerificationStatus, isVerifiedStatus, needsVerificationReview } from "../../utils/verificationStatus";

export default function AccountScreen() {
  const router = useRouter();
  const { user, loading, isGuest } = useCurrentUser();
  const navRole: "customer" | "driver" | undefined = user?.role === "driver"
    ? "driver"
    : user?.role === "courier" || user?.role === "merchant" || user?.role === "admin"
      ? undefined
      : "customer";
  const verified = isIdentityVerified(user);
  const name = displayNameOrFallback(user?.name);

  useEffect(() => {
    if (user?.role === "driver") router.replace("/(driver)/account" as never);
    else if (user?.role === "courier") router.replace("/(courier)/account" as never);
    else if (user?.role === "merchant") router.replace("/(merchant)/account" as never);
  }, [router, user?.role]);

  if (!loading && isGuest) {
    return (
      <Screen navRole="customer">
        <View style={styles.guestHero}>
          <View style={styles.guestIcon}>
            <MaterialCommunityIcons name="account-circle-outline" size={36} color={v2Theme.colors.ink} />
          </View>
          <Text style={styles.guestEyebrow}>YOUR LETSGORIDE ACCOUNT</Text>
          <Text style={styles.guestTitle}>Browse freely. Sign in when you need to.</Text>
          <Text style={styles.guestBody}>
            You can explore rides, food and courier without an account. Sign in when you want to book, send, message or save something.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/(auth)/email-login" as never)}
            style={({ pressed }) => [styles.guestPrimary, pressed && styles.pressed]}
          >
            <Text style={styles.guestPrimaryText}>Sign in</Text>
            <MaterialCommunityIcons name="arrow-right" size={20} color="#FFFFFF" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/(auth)/email-register" as never)}
            style={({ pressed }) => [styles.guestSecondary, pressed && styles.pressed]}
          >
            <Text style={styles.guestSecondaryText}>Create customer account</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push("/(shared)/work-with-us" as never)} style={({ pressed }) => [styles.guestSecondary, pressed && styles.pressed]}><Text style={styles.guestSecondaryText}>Work with LetsGoRide</Text></Pressable>
        </View>
      </Screen>
    );
  }

  const accountLabel = accountTypeLabel(user?.role);
  const driverVerification = driverVerificationCopy(user?.verification_status || "not_started");

  return (
    <Screen navRole={navRole}>
      <View style={styles.profileHeader}>
        <Avatar name={name} imageUri={user?.profile_photo_url} size={68} tone="neutral" />
        <View style={styles.profileCopy}>
          <View style={styles.nameRow}>
            <Text numberOfLines={1} style={styles.name}>{name}</Text>
            <VerifiedBadge verified={verified} size="medium" />
          </View>
          <Text style={styles.meta}>{user?.city || "Zimbabwe"}</Text>
          <Text style={styles.accountType}>{accountLabel}</Text>
        </View>
      </View>

      <View style={styles.utilityPanel}>
        <Text style={styles.utilityTitle}>Quick access</Text>
        <View style={styles.utilityGrid}>
          <QuickAction icon="message-text-outline" label="Inbox" onPress={() => router.push("/(shared)/messages" as never)} />
        </View>
      </View>

      <AccountDetailsSummary
        rows={[
          { label: "Full legal name", value: user?.name || "Not added" },
          { label: "Email", value: user?.email || "Not added" },
          { label: "Phone", value: user?.phone || "Not added" },
          { label: "City", value: user?.city || "Not added" },
        ]}
        note={user?.role === "passenger" ? "Contact LetsGoRide Support to change your legal name." : "Contact LetsGoRide Support to request an account correction."}
        onEdit={user?.role === "passenger" ? () => router.push({ pathname: "/(shared)/edit-profile", params: { mode: "edit" } } as never) : undefined}
        onRequestChange={() => router.push({ pathname: "/(shared)/support", params: { subject: "Account details change" } } as never)}
      />

      {user?.role === "driver" ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Driver verification</Text>
          <AccountRow
            icon="steering"
            title="Driver verification"
            subtitle={driverVerification.subtitle}
            tone={driverVerification.tone}
            onPress={() => router.push("/(shared)/verification" as never)}
          />
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>More</Text>
        {user?.role === "passenger" ? <AccountRow icon="briefcase-outline" title="Work with LetsGoRide" subtitle="Courier, Driver and Merchant applications" onPress={() => router.push("/(shared)/work-with-us" as never)} /> : null}
        <AccountRow icon="cog-outline" title="Settings" subtitle="Notifications and device security" onPress={() => router.push("/(shared)/settings" as never)} />
      </View>

      <AccountComplianceSections product="customer" />
    </Screen>
  );
}

function accountTypeLabel(role?: string) {
  if (role === "driver") return "Driver";
  if (role === "courier") return "Courier";
  if (role === "merchant") return "Merchant";
  if (role === "admin") return "Admin";
  return "Customer";
}

function driverVerificationCopy(status: string): { subtitle: string; tone: "neutral" | "success" | "warning" } {
  if (isVerifiedStatus(status)) return { subtitle: "Driver verification approved", tone: "success" };
  if (isPendingVerificationStatus(status)) return { subtitle: "Verification under review", tone: "warning" };
  if (needsVerificationReview(status)) return { subtitle: "Action needed · review your documents", tone: "warning" };
  return { subtitle: "Required before posting driver trips", tone: "neutral" };
}

function QuickAction({ icon, label, onPress }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.quickCard, pressed && styles.pressed]}
    >
      <View style={styles.quickIcon}><MaterialCommunityIcons name={icon} size={21} color={v2Theme.colors.ink} /></View>
      <Text style={styles.quickLabel}>{label}</Text>
      <MaterialCommunityIcons name="chevron-right" size={17} color={v2Theme.colors.inkTertiary} />
    </Pressable>
  );
}

function AccountRow({
  icon,
  title,
  subtitle,
  onPress,
  tone = "neutral",
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
  tone?: "neutral" | "success" | "warning";
}) {
  const iconColor = tone === "warning" ? v2Theme.colors.warning : v2Theme.colors.ink;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={[styles.rowIcon, tone === "success" && styles.rowIconSuccess, tone === "warning" && styles.rowIconWarning]}>
        <MaterialCommunityIcons name={icon} size={22} color={iconColor} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={22} color={v2Theme.colors.inkTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  guestHero: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, padding: 20, gap: 12, shadowColor: v2Theme.colors.shadow, shadowOpacity: 0.08, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 4 },
  guestIcon: { width: 62, height: 62, borderRadius: 22, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  guestEyebrow: { color: v2Theme.colors.ink, fontSize: 11, fontWeight: "900", letterSpacing: 1.1 },
  guestTitle: { color: v2Theme.colors.ink, fontSize: 28, lineHeight: 33, fontWeight: "900", letterSpacing: -0.8 },
  guestBody: { color: v2Theme.colors.inkSecondary, fontSize: 14, lineHeight: 21 },
  guestPrimary: { minHeight: 54, borderRadius: 18, backgroundColor: v2Theme.colors.ink, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, marginTop: 4 },
  guestPrimaryText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  guestSecondary: { minHeight: 50, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, alignItems: "center", justifyContent: "center" },
  guestSecondaryText: { color: v2Theme.colors.ink, fontSize: 14, fontWeight: "900" },
  profileHeader: { flexDirection: "row", alignItems: "center", gap: 15, paddingVertical: 5 },
  profileCopy: { flex: 1, gap: 5 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  name: { flexShrink: 1, color: v2Theme.colors.ink, fontSize: 26, fontWeight: "900", letterSpacing: -0.7 },
  meta: { color: v2Theme.colors.inkSecondary, fontSize: 13 },
  accountType: { color: v2Theme.colors.ink, fontSize: 11, fontWeight: "800" },
  utilityPanel: { gap: 10 },
  utilityTitle: { color: v2Theme.colors.ink, fontSize: 20, fontWeight: "900", letterSpacing: -0.35 },
  utilityGrid: { flexDirection: "row", gap: 8 },
  quickCard: { flex: 1, minHeight: 68, borderRadius: 18, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 8 },
  quickIcon: { width: 36, height: 36, borderRadius: 13, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  quickLabel: { flex: 1, color: v2Theme.colors.ink, fontSize: 11, fontWeight: "900" },
  section: { gap: 9 },
  sectionTitle: { color: v2Theme.colors.ink, fontSize: 20, fontWeight: "900", letterSpacing: -0.4 },
  row: { minHeight: 74, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  rowIcon: { width: 42, height: 42, borderRadius: 15, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  rowIconSuccess: { backgroundColor: v2Theme.colors.surfaceMuted },
  rowIconWarning: { backgroundColor: v2Theme.colors.warningSoft },
  rowCopy: { flex: 1, gap: 3 },
  rowTitle: { color: v2Theme.colors.ink, fontSize: 14, fontWeight: "900" },
  rowSubtitle: { color: v2Theme.colors.inkSecondary, fontSize: 11, lineHeight: 16 },
  pressed: { opacity: 0.7 },
});
