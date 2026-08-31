import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { AccountComplianceSections } from "../../components/account/AccountComplianceSections";
import { AccountDetailsSummary } from "../../components/account/AccountDetailsSummary";
import { HailingMapBackdrop } from "../../components/hailing/HailingMapBackdrop";
import { BottomNav } from "../../components/layout/BottomNav";
import { Avatar } from "../../components/ui/Avatar";
import { VerifiedBadge } from "../../components/ui/VerifiedBadge";
import { v2Theme } from "../../constants/v2Theme";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useDriver } from "../../hooks/useDriver";
import { listMyWorkerApplications } from "../../services/operationsService";
import { WorkerApplication } from "../../types/operations.types";

const DRIVER_BLACK = "#111111";

export default function DriverAccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useCurrentUser();
  const { driver } = useDriver();
  const [application, setApplication] = useState<WorkerApplication | null>(null);
  const verified = Boolean(driver?.verified || driver?.verification_status === "approved");
  const productParam = { product: "driver" };

  useFocusEffect(useCallback(() => {
    let active = true;
    void listMyWorkerApplications()
      .then((items) => {
        if (active) setApplication(items.find((item) => item.product === "driver") || null);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []));

  const displayName = application?.full_name || user?.name || "Driver";
  const serviceArea = application?.service_area || String(driver?.city || user?.city || "Not added");
  const vehicle = String(driver?.vehicle || "Not added");
  const rating = driver?.rating ? Number(driver.rating).toFixed(1) : "New";
  const navBottom = v2Theme.control.navHeight + Math.max(insets.bottom, 10) + 26;

  return (
    <SafeAreaView edges={[]} style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <HailingMapBackdrop bottomPadding={620} />
      <View pointerEvents="none" style={styles.mapMood} />

      <View pointerEvents="box-none" style={[styles.topBar, { top: insets.top + 8 }]}>
        <View style={styles.titlePill}>
          <MaterialCommunityIcons name="steering" size={17} color={DRIVER_BLACK} />
          <Text style={styles.titlePillText}>DRIVER PROFILE</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Driver settings"
          onPress={() => router.push({ pathname: "/(shared)/settings", params: productParam } as never)}
          style={({ pressed }) => [styles.settingsButton, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="cog-outline" size={21} color={DRIVER_BLACK} />
        </Pressable>
      </View>

      <View pointerEvents="none" style={styles.profileFloat}>
        <Avatar name={displayName} imageUri={user?.profile_photo_url} size={68} />
        <View style={styles.profileCopy}>
          <View style={styles.profileNameLine}>
            <Text numberOfLines={1} style={styles.profileName}>{displayName}</Text>
            <VerifiedBadge verified={verified} size="medium" />
          </View>
          <Text numberOfLines={1} style={styles.profileMeta}>{serviceArea}</Text>
        </View>
      </View>

      <View style={[styles.sheet, { top: Math.max(insets.top + 160, 220) }]}>
        <View style={styles.handle} />
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: navBottom }]}
          scrollIndicatorInsets={{ bottom: navBottom }}
        >
          <View style={styles.essentials}>
            <Essential icon="car-info" label="Vehicle" value={vehicle} />
            <Essential icon="map-marker-radius-outline" label="Area" value={serviceArea} />
            <Essential icon="star-outline" label="Rating" value={rating} />
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: "/(shared)/verification", params: productParam } as never)}
            style={({ pressed }) => [styles.verification, verified && styles.verificationGood, pressed && styles.pressed]}
          >
            <View style={styles.verificationIcon}>
              <MaterialCommunityIcons
                name={verified ? "shield-check" : "shield-account-outline"}
                size={25}
                color={verified ? v2Theme.colors.brandStrong : v2Theme.colors.warning}
              />
            </View>
            <View style={styles.flex}>
              <Text style={styles.verificationTitle}>{verified ? "Driver verified" : "Verification required"}</Text>
              <Text style={styles.verificationBody}>
                {verified
                  ? "Identity, licence and vehicle review are approved."
                  : "Complete identity, licence, vehicle and selfie review before driving."}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={v2Theme.colors.inkTertiary} />
          </Pressable>

          <View style={styles.section}>
            <Text style={styles.sectionEyebrow}>DRIVER TOOLS</Text>
            <View style={styles.toolRow}>
              <Tool
                icon="routes"
                title="Trips"
                body="Active and past"
                onPress={() => router.push("/(driver)/trips" as never)}
              />
              <Tool
                icon="calendar-outline"
                title="Calendar"
                body="Availability"
                onPress={() => router.push("/(driver)/availability" as never)}
              />
              <Tool
                icon="plus-circle-outline"
                title="Post"
                body="Share a route"
                onPress={() => router.push("/(driver)/post-trip" as never)}
              />
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeadingRow}>
              <View>
                <Text style={styles.sectionEyebrow}>IDENTITY</Text>
                <Text style={styles.sectionTitle}>Account details</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: "/(shared)/support", params: { ...productParam, subject: "Account details change" } } as never)}
                hitSlop={8}
              >
                <Text style={styles.textAction}>Request change</Text>
              </Pressable>
            </View>
            <AccountDetailsSummary
              rows={[
                { label: "Full legal name", value: displayName },
                { label: "Email", value: user?.email || "Not added" },
                { label: "Phone", value: application?.phone || user?.phone || "Not added" },
                { label: "Service city", value: serviceArea },
              ]}
              note="These details were used to verify your Driver account."
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionEyebrow}>MONEY</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/(shared)/wallet" as never)}
              style={({ pressed }) => [styles.moneyRow, pressed && styles.pressed]}
            >
              <View style={styles.moneyIcon}>
                <MaterialCommunityIcons name="wallet-outline" size={20} color={DRIVER_BLACK} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.moneyTitle}>Wallet & settlement</Text>
                <Text style={styles.moneyBody}>Cash ledger, weekly balance and payout methods</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={v2Theme.colors.inkTertiary} />
            </Pressable>
          </View>

          <AccountComplianceSections product="driver" />
        </ScrollView>
      </View>

      <BottomNav role="driver" bottomOffset={Math.max(insets.bottom, 10)} />
    </SafeAreaView>
  );
}

function Essential({ icon, label, value }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.essential}>
      <MaterialCommunityIcons name={icon} size={19} color={v2Theme.colors.brandStrong} />
      <Text style={styles.essentialLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.essentialValue}>{value}</Text>
    </View>
  );
}

function Tool({ icon, title, body, onPress }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; body: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.tool, pressed && styles.pressed]}>
      <View style={styles.toolIcon}>
        <MaterialCommunityIcons name={icon} size={20} color={DRIVER_BLACK} />
      </View>
      <Text style={styles.toolTitle}>{title}</Text>
      <Text style={styles.toolBody}>{body}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F0EEE8" },
  flex: { flex: 1 },
  mapMood: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    backgroundColor: "rgba(17,17,17,0.035)",
  },
  topBar: {
    position: "absolute",
    left: 14,
    right: 14,
    zIndex: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  titlePill: {
    minHeight: 42,
    paddingHorizontal: 13,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(17,17,17,0.09)",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  titlePillText: { color: DRIVER_BLACK, fontSize: 9, fontWeight: "900", letterSpacing: 1.05 },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.96)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(17,17,17,0.09)",
  },
  profileFloat: {
    position: "absolute",
    zIndex: 15,
    top: "14%",
    left: 18,
    right: 18,
    minHeight: 88,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(17,17,17,0.09)",
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 9 },
    elevation: 8,
  },
  profileCopy: { flex: 1, gap: 3 },
  profileNameLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  profileName: { flexShrink: 1, color: DRIVER_BLACK, fontSize: 20, fontWeight: "900", letterSpacing: -0.45 },
  profileMeta: { color: v2Theme.colors.inkSecondary, fontSize: 10, fontWeight: "800" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    borderTopLeftRadius: 34,
    borderTopRightRadius: 34,
    backgroundColor: "rgba(251,250,247,0.985)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(17,17,17,0.08)",
    shadowColor: "#000000",
    shadowOpacity: 0.10,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -8 },
    elevation: 10,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: v2Theme.colors.lineStrong, alignSelf: "center", marginTop: 9 },
  content: { paddingHorizontal: 16, paddingTop: 18, gap: 22 },
  essentials: { flexDirection: "row", gap: 7 },
  essential: {
    flex: 1,
    minHeight: 92,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: v2Theme.colors.line,
    padding: 10,
    gap: 4,
  },
  essentialLabel: { color: v2Theme.colors.inkTertiary, fontSize: 8, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.5 },
  essentialValue: { color: DRIVER_BLACK, fontSize: 11, fontWeight: "900", marginTop: 1 },
  verification: {
    minHeight: 78,
    borderRadius: 22,
    backgroundColor: v2Theme.colors.warningSoft,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  verificationGood: { backgroundColor: v2Theme.colors.brandSofter },
  verificationIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  verificationTitle: { color: DRIVER_BLACK, fontSize: 13, fontWeight: "900" },
  verificationBody: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14, marginTop: 2 },
  section: { gap: 9 },
  sectionEyebrow: { color: v2Theme.colors.brandStrong, fontSize: 8, fontWeight: "900", letterSpacing: 1.05 },
  sectionTitle: { color: DRIVER_BLACK, fontSize: 18, fontWeight: "900", marginTop: 2 },
  sectionHeadingRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 10 },
  textAction: { color: v2Theme.colors.brandStrong, fontSize: 10, fontWeight: "900" },
  toolRow: { flexDirection: "row", gap: 7 },
  tool: {
    flex: 1,
    minHeight: 108,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: v2Theme.colors.line,
    padding: 10,
    gap: 5,
  },
  toolIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  toolTitle: { color: DRIVER_BLACK, fontSize: 11, fontWeight: "900" },
  toolBody: { color: v2Theme.colors.inkSecondary, fontSize: 8, lineHeight: 12 },
  moneyRow: {
    minHeight: 70,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: v2Theme.colors.line,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  moneyIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  moneyTitle: { color: DRIVER_BLACK, fontSize: 11, fontWeight: "900" },
  moneyBody: { color: v2Theme.colors.inkSecondary, fontSize: 8, marginTop: 2 },
  pressed: { opacity: 0.72 },
});
