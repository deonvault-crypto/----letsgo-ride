import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";

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
  const navRole = user?.role === "driver" || user?.role === "courier" ? "driver" : "passenger";
  const verified = isIdentityVerified(user);
  const name = displayNameOrFallback(user?.name);

  const loadVerification = useCallback(async () => {
    if (!user) {
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
      <Screen navRole="passenger">
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
            <Text style={styles.guestSecondaryText}>Create customer account</Text>
          </Pressable>
        </View>

        <View style={styles.guestNote}>
          <MaterialCommunityIcons name="information-outline" size={21} color={v2Theme.colors.inkSecondary} />
          <Text style={styles.guestNoteText}>
            Driver, Courier and Merchant accounts are separate products. A customer account never switches into those workspaces.
          </Text>
        </View>
      </Screen>
    );
  }

  const driverVerificationStatus =
    verification?.verification_status || user?.verification_status || "not_started";
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
            <Text style={styles.modeText}>{accountLabel.toUpperCase()} ACCOUNT</Text>
          </View>
        </View>
      </View>

      <View style={styles.quickGrid}>
        <QuickAction icon="lifebuoy" label="Help" onPress={() => router.push("/(shared)/support" as never)} />
        <QuickAction icon="wallet-outline" label="Wallet" onPress={() => router.push("/(shared)/wallet" as never)} />
        <QuickAction icon="shield-check-outline" label="Safety" onPress={() => router.push("/(shared)/safety" as never)} />
        <QuickAction icon="message-text-outline" label="Inbox" onPress={() => router.push("/(shared)/messages" as never)} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Verification</Text>
        <AccountRow
          icon="account-check-outline"
          title="Identity verification"
          subtitle={verified ? "Identity verified" : "Review your identity status"}
          tone={verified ? "success" : "neutral"}
          onPress={() => router.push("/(shared)/verification" as never)}
        />
        {user?.role === "driver" ? (
          <AccountRow
            icon="steering"
            title="Driver verification"
            subtitle={driverVerification.subtitle}
            tone={driverVerification.tone}
            onPress={() => router.push("/(shared)/verification" as never)}
          />
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <AccountRow icon="cog-outline" title="Settings" subtitle="Account, privacy and app preferences" onPress={() => router.push("/(shared)/settings" as never)} />
        <AccountRow icon="shield-lock-outline" title="Privacy" subtitle="Control your information and account" onPress={() => router.push("/(shared)/settings" as never)} />
        <AccountRow icon="lifebuoy" title="Support" subtitle="Get help from LetsGoRide" onPress={() => router.push("/(shared)/support" as never)} />
      </View>

      <View style={styles.separationCard}>
        <View style={styles.separationIcon}>
          <MaterialCommunityIcons name="layers-triple-outline" size={25} color={v2Theme.colors.brandStrong} />
        </View>
        <View style={styles.separationCopy}>
          <Text style={styles.separationTitle}>{accountLabel} stays {accountLabel.toLowerCase()}.</Text>
          <Text style={styles.separationBody}>
            LetsGoRide keeps Customer, Driver, Courier and Merchant identities separate so each workspace stays focused and safe.
          </Text>
        </View>
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
      <View style={styles.quickIcon}>
        <MaterialCommunityIcons name={icon} size={24} color={v2Theme.colors.ink} />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
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
  const iconColor =
    tone === "success"
      ? v2Theme.colors.brandStrong
      : tone === "warning"
        ? v2Theme.colors.warning
        : v2Theme.colors.ink;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={[
        styles.rowIcon,
        tone === "success" && styles.rowIconSuccess,
        tone === "warning" && styles.rowIconWarning,
      ]}>
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

function driverVerificationCopy(status: string): {
  subtitle: string;
  tone: "neutral" | "success" | "warning";
} {
  if (isVerifiedStatus(status)) {
    return { subtitle: "Driver verification approved", tone: "success" };
  }
  if (isPendingVerificationStatus(status)) {
    return { subtitle: "Verification under review", tone: "warning" };
  }
  if (needsVerificationReview(status)) {
    return { subtitle: "Action needed · review your documents", tone: "warning" };
  }
  return { subtitle: "Required before posting driver trips", tone: "neutral" };
}

const styles = StyleSheet.create({
  guestHero: {
    borderRadius: v2Theme.radius.xxl,
    backgroundColor: v2Theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: v2Theme.colors.lineStrong,
    padding: 20,
    gap: 12,
    shadowColor: v2Theme.colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
  },
  guestIcon: {
    width: 62,
    height: 62,
    borderRadius: 22,
    backgroundColor: v2Theme.colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  guestEyebrow: {
    color: v2Theme.colors.brandStrong,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  guestTitle: {
    color: v2Theme.colors.ink,
    fontSize: 28,
    lineHeight: 33,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  guestBody: {
    color: v2Theme.colors.inkSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  guestPrimary: {
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: v2Theme.colors.brand,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    marginTop: 4,
  },
  guestPrimaryText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  guestSecondary: {
    minHeight: 50,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: v2Theme.colors.lineStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  guestSecondaryText: { color: v2Theme.colors.ink, fontSize: 14, fontWeight: "900" },
  guestNote: {
    borderRadius: v2Theme.radius.xl,
    backgroundColor: v2Theme.colors.surfaceMuted,
    padding: 15,
    flexDirection: "row",
    gap: 11,
    alignItems: "flex-start",
  },
  guestNoteText: { flex: 1, color: v2Theme.colors.inkSecondary, fontSize: 12, lineHeight: 18 },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
    paddingVertical: 5,
  },
  profileCopy: { flex: 1, gap: 5 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  name: {
    flexShrink: 1,
    color: v2Theme.colors.ink,
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: -0.7,
  },
  meta: {
    color: v2Theme.colors.inkSecondary,
    fontSize: 13,
  },
  modePill: {
    alignSelf: "flex-start",
    borderRadius: v2Theme.radius.pill,
    backgroundColor: v2Theme.colors.surfaceMuted,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  modeText: {
    color: v2Theme.colors.inkSecondary,
    fontSize: 10,
    fontWeight: "900",
  },
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  quickCard: {
    width: "48%",
    minHeight: 94,
    borderRadius: v2Theme.radius.xl,
    backgroundColor: v2Theme.colors.surfaceMuted,
    padding: 13,
    justifyContent: "space-between",
  },
  quickIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: v2Theme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  quickLabel: {
    color: v2Theme.colors.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  section: { gap: 9 },
  sectionTitle: {
    color: v2Theme.colors.ink,
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  row: {
    minHeight: 74,
    borderRadius: v2Theme.radius.xl,
    backgroundColor: v2Theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: v2Theme.colors.line,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: v2Theme.colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  rowIconSuccess: { backgroundColor: v2Theme.colors.brandSoft },
  rowIconWarning: { backgroundColor: v2Theme.colors.warningSoft },
  rowCopy: { flex: 1, gap: 3 },
  rowTitle: {
    color: v2Theme.colors.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  rowSubtitle: {
    color: v2Theme.colors.inkSecondary,
    fontSize: 11,
    lineHeight: 16,
  },
  separationCard: {
    borderRadius: v2Theme.radius.xxl,
    backgroundColor: v2Theme.colors.brandSofter,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  separationIcon: {
    width: 50,
    height: 50,
    borderRadius: 17,
    backgroundColor: v2Theme.colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  separationCopy: { flex: 1, gap: 4 },
  separationTitle: {
    color: v2Theme.colors.ink,
    fontSize: 15,
    fontWeight: "900",
  },
  separationBody: {
    color: v2Theme.colors.inkSecondary,
    fontSize: 11,
    lineHeight: 16,
  },
  pressed: { opacity: 0.7 },
});
