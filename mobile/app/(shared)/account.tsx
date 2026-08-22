import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { Avatar } from "../../components/ui/Avatar";
import { Screen } from "../../components/ui/Screen";
import { VerifiedBadge, isIdentityVerified } from "../../components/ui/VerifiedBadge";
import { v2Theme } from "../../constants/v2Theme";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { displayNameOrFallback } from "../../utils/displayName";
import { formatStatus } from "../../utils/formatStatus";

export default function AccountScreen() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const role = user?.role === "driver" ? "driver" : "passenger";
  const verified = isIdentityVerified(user);
  const name = displayNameOrFallback(user?.name);

  return (
    <Screen navRole={role}>
      <View style={styles.profileHeader}>
        <Avatar name={name} imageUri={user?.profile_photo_url} size={68} />
        <View style={styles.profileCopy}>
          <View style={styles.nameRow}>
            <Text numberOfLines={1} style={styles.name}>{name}</Text>
            <VerifiedBadge verified={verified} size="medium" />
          </View>
          <Text style={styles.meta}>{user?.city || "Zimbabwe"}</Text>
          <View style={styles.modePill}>
            <Text style={styles.modeText}>Current mode · {formatStatus(role)}</Text>
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
        <AccountRow
          icon="steering"
          title="Driver verification"
          subtitle={role === "driver" ? "Manage driver verification and documents" : "Required before posting driver trips"}
          onPress={() => router.push("/(shared)/verification" as never)}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <AccountRow icon="cog-outline" title="Settings" subtitle="Account, privacy and app preferences" onPress={() => router.push("/(shared)/settings" as never)} />
        <AccountRow icon="shield-lock-outline" title="Privacy" subtitle="Control your information and account" onPress={() => router.push("/(shared)/settings" as never)} />
        <AccountRow icon="lifebuoy" title="Support" subtitle="Get help from LetsGoRide" onPress={() => router.push("/(shared)/support" as never)} />
      </View>

      <View style={styles.modeCard}>
        <View style={styles.modeCardIcon}>
          <MaterialCommunityIcons
            name={role === "driver" ? "account-outline" : "steering"}
            size={28}
            color={v2Theme.colors.brandStrong}
          />
        </View>
        <View style={styles.modeCardCopy}>
          <Text style={styles.modeCardTitle}>{role === "driver" ? "Passenger mode" : "Driver mode"}</Text>
          <Text style={styles.modeCardBody}>
            {role === "driver"
              ? "Switch back to booking and managing your own rides."
              : "Post routes and manage passenger requests from the driver workspace."}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace(role === "driver" ? "/(passenger)/home" as never : "/(driver)/home" as never)}
          style={({ pressed }) => [styles.switchButton, pressed && styles.pressed]}
        >
          <Text style={styles.switchText}>Switch</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

function QuickAction({ icon, label, onPress }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.quickCard, pressed && styles.pressed]}>
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
  tone?: "neutral" | "success";
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={[styles.rowIcon, tone === "success" && styles.rowIconSuccess]}>
        <MaterialCommunityIcons
          name={icon}
          size={22}
          color={tone === "success" ? v2Theme.colors.brandStrong : v2Theme.colors.ink}
        />
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
  modeCard: {
    borderRadius: v2Theme.radius.xxl,
    backgroundColor: v2Theme.colors.brandSofter,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  modeCardIcon: {
    width: 50,
    height: 50,
    borderRadius: 17,
    backgroundColor: v2Theme.colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  modeCardCopy: { flex: 1, gap: 4 },
  modeCardTitle: {
    color: v2Theme.colors.ink,
    fontSize: 15,
    fontWeight: "900",
  },
  modeCardBody: {
    color: v2Theme.colors.inkSecondary,
    fontSize: 11,
    lineHeight: 16,
  },
  switchButton: {
    minHeight: 42,
    borderRadius: 15,
    backgroundColor: v2Theme.colors.brand,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  switchText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  pressed: { opacity: 0.7 },
});
