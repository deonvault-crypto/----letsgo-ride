import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { LinearGradient } from "expo-linear-gradient";

import { Avatar } from "../../components/ui/Avatar";
import { Screen } from "../../components/ui/Screen";
import { VerifiedBadge, isIdentityVerified } from "../../components/ui/VerifiedBadge";
import { v2Theme } from "../../constants/v2Theme";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useLiveRefresh } from "../../hooks/useLiveRefresh";
import { getMyVerification } from "../../services/verificationService";
import { VerificationProfile } from "../../types/verification.types";
import { displayNameOrFallback } from "../../utils/displayName";
import {
  isPendingVerificationStatus,
  isVerifiedStatus,
  needsVerificationReview,
} from "../../utils/verificationStatus";

export default function AccountScreen() {
  const router = useRouter();
  const { user, loading, isGuest } = useCurrentUser();
  const [verification, setVerification] = useState<VerificationProfile | null>(null);
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

  const loadVerification = useCallback(async () => {
    if (!user || user.role !== "driver") {
      setVerification(null);
      return;
    }
    try {
      setVerification(await getMyVerification());
    } catch {
      setVerification(null);
    }
  }, [user]);

  useLiveRefresh(loadVerification, 30000);

  if (!loading && isGuest) {
    return (
      <Screen navRole="customer">
        <View style={styles.guestHero}>
          <View style={styles.guestIcon}>
            <MaterialCommunityIcons name="account-circle-outline" size={36} color={v2Theme.colors.brandStrong} />
          </View>
          <Text style={styles.guestEyebrow}>YOUR LETSGORIDE ACCOUNT</Text>
          <Text style={styles.guestTitle}>Browse freely. Sign in when you need to.</Text>
          <Text style={styles.guestBody}>
            You can explore rides, food and courier without an account. Sign in when you want to book, send, message, pay or save something.
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
            <Text style={styles.guestSecondaryText}>Create account</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push("/(shared)/work-with-us" as never)} style={({ pressed }) => [styles.guestSecondary, pressed && styles.pressed]}><Text style={styles.guestSecondaryText}>Work with LetsGoRide</Text></Pressable>
        </View>

      </Screen>
    );
  }

  const driverVerificationStatus = verification?.verification_status || user?.verification_status || "not_started";
  const driverVerification = driverVerificationCopy(driverVerificationStatus);
  const accountLabel = accountTypeLabel(user?.role);

  return (
    <Screen navRole={navRole}>
      <View style={styles.profileHeader}>
        <Avatar name={name} imageUri={user?.profile_photo_url} size={68} />
        <View style={styles.profileCopy}>
          <View style={styles.nameRow}>
            <Text numberOfLines={1} style={styles.name}>{name}</Text>
            <VerifiedBadge verified={verified} size="medium" />
          </View>
          <Text style={styles.meta}>{user?.city || "Zimbabwe"}</Text>
          <View style={styles.modePill}>
            <Text style={styles.modeText}>{accountLabel === "Customer" ? "LETSGORIDE MEMBER" : accountLabel.toUpperCase()}</Text>
          </View>
        </View>
      </View>

      <LinearGradient colors={["#17231B", "#0E130F"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.utilityPanel}>
        <View style={styles.utilityHeading}><View><Text style={styles.utilityEyebrow}>YOUR ESSENTIALS</Text><Text style={styles.utilityTitle}>Everything within reach.</Text></View><View style={styles.utilityGlow} /></View>
        <View style={styles.utilityGrid}>
          <QuickAction icon="message-text-outline" label="Inbox" onPress={() => router.push("/(shared)/messages" as never)} />
          <QuickAction icon="lifebuoy" label="Help" onPress={() => router.push("/(shared)/support" as never)} />
          <QuickAction icon="shield-check-outline" label="Safety" onPress={() => router.push("/(shared)/safety" as never)} />
          <QuickAction icon="wallet-outline" label="Wallet" onPress={() => router.push("/(shared)/wallet" as never)} />
        </View>
      </LinearGradient>

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
        <Text style={styles.sectionTitle}>Account</Text>
        {user?.role === "passenger" ? <AccountRow icon="briefcase-outline" title="Work with LetsGoRide" subtitle="Courier, Driver and Merchant applications" onPress={() => router.push("/(shared)/work-with-us" as never)} /> : null}
        <AccountRow icon="cog-outline" title="Settings" subtitle="Account, privacy and app preferences" onPress={() => router.push("/(shared)/settings" as never)} />
        <AccountRow icon="shield-lock-outline" title="Privacy" subtitle="Control your information and account" onPress={() => router.push("/(shared)/settings" as never)} />
        <AccountRow icon="lifebuoy" title="Support" subtitle="Get help from LetsGoRide" onPress={() => router.push("/(shared)/support" as never)} />
      </View>

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

function QuickAction({ icon, label, onPress }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.quickCard, pressed && styles.pressed]}
    >
      <MaterialCommunityIcons name={icon} size={21} color="#B5E8C5" />
      <Text style={styles.quickLabel}>{label}</Text>
      <MaterialCommunityIcons name="arrow-top-right" size={15} color="rgba(255,255,255,0.48)" />
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
  const iconColor = tone === "success" ? v2Theme.colors.brandStrong : tone === "warning" ? v2Theme.colors.warning : v2Theme.colors.ink;

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

function driverVerificationCopy(status: string): { subtitle: string; tone: "neutral" | "success" | "warning" } {
  if (isVerifiedStatus(status)) return { subtitle: "Driver verification approved", tone: "success" };
  if (isPendingVerificationStatus(status)) return { subtitle: "Verification under review", tone: "warning" };
  if (needsVerificationReview(status)) return { subtitle: "Action needed · review your documents", tone: "warning" };
  return { subtitle: "Required before posting driver trips", tone: "neutral" };
}

const styles = StyleSheet.create({
  guestHero: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, padding: 20, gap: 12, shadowColor: v2Theme.colors.shadow, shadowOpacity: 0.08, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 4 },
  guestIcon: { width: 62, height: 62, borderRadius: 22, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" },
  guestEyebrow: { color: v2Theme.colors.brandStrong, fontSize: 11, fontWeight: "900", letterSpacing: 1.1 },
  guestTitle: { color: v2Theme.colors.ink, fontSize: 28, lineHeight: 33, fontWeight: "900", letterSpacing: -0.8 },
  guestBody: { color: v2Theme.colors.inkSecondary, fontSize: 14, lineHeight: 21 },
  guestPrimary: { minHeight: 54, borderRadius: 18, backgroundColor: v2Theme.colors.brand, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, marginTop: 4 },
  guestPrimaryText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  guestSecondary: { minHeight: 50, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, alignItems: "center", justifyContent: "center" },
  guestSecondaryText: { color: v2Theme.colors.ink, fontSize: 14, fontWeight: "900" },
  profileHeader: { flexDirection: "row", alignItems: "center", gap: 15, paddingVertical: 5 },
  profileCopy: { flex: 1, gap: 5 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  name: { flexShrink: 1, color: v2Theme.colors.ink, fontSize: 26, fontWeight: "900", letterSpacing: -0.7 },
  meta: { color: v2Theme.colors.inkSecondary, fontSize: 13 },
  modePill: { alignSelf: "flex-start", borderRadius: v2Theme.radius.pill, backgroundColor: v2Theme.colors.surfaceMuted, paddingHorizontal: 9, paddingVertical: 5 },
  modeText: { color: v2Theme.colors.inkSecondary, fontSize: 10, fontWeight: "900" },
  utilityPanel: { borderRadius: v2Theme.radius.xxl, padding: 17, gap: 15, overflow: "hidden" },
  utilityHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  utilityEyebrow: { color: "#89DBA5", fontSize: 8, fontWeight: "900", letterSpacing: 1.05 },
  utilityTitle: { color: "#FFFFFF", fontSize: 19, fontWeight: "900", marginTop: 4, letterSpacing: -0.35 },
  utilityGlow: { width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(50,190,99,0.18)", position: "absolute", right: -16, top: -30 },
  utilityGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  quickCard: { width: "48%", minHeight: 48, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.08)", paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 8 },
  quickLabel: { flex: 1, color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  section: { gap: 9 },
  sectionTitle: { color: v2Theme.colors.ink, fontSize: 20, fontWeight: "900", letterSpacing: -0.4 },
  row: { minHeight: 74, borderRadius: v2Theme.radius.xl, backgroundColor: v2Theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.line, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  rowIcon: { width: 42, height: 42, borderRadius: 15, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  rowIconSuccess: { backgroundColor: v2Theme.colors.brandSoft },
  rowIconWarning: { backgroundColor: v2Theme.colors.warningSoft },
  rowCopy: { flex: 1, gap: 3 },
  rowTitle: { color: v2Theme.colors.ink, fontSize: 14, fontWeight: "900" },
  rowSubtitle: { color: v2Theme.colors.inkSecondary, fontSize: 11, lineHeight: 16 },
  pressed: { opacity: 0.7 },
});
