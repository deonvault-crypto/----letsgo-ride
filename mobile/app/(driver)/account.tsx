import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";

import { AccountDetailsSummary } from "../../components/account/AccountDetailsSummary";
import { Avatar } from "../../components/ui/Avatar";
import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useDriver } from "../../hooks/useDriver";
import { logoutToGuest } from "../../services/authService";
import { listMyWorkerApplications } from "../../services/operationsService";
import { WorkerApplication } from "../../types/operations.types";

export default function DriverAccountScreen() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const { driver } = useDriver();
  const [application, setApplication] = useState<WorkerApplication | null>(null);
  const verified = Boolean(driver?.verified || driver?.verification_status === "approved");
  const productParam = { product: "driver" };
  useFocusEffect(useCallback(() => {
    let active = true;
    void listMyWorkerApplications().then((items) => {
      if (active) setApplication(items.find((item) => item.product === "driver") || null);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []));
  async function signOut() { await logoutToGuest(router); }
  return (
    <Screen title="Account" navRole="driver">
      <View style={styles.profile}><Avatar name={application?.full_name || user?.name || "Driver"} imageUri={user?.profile_photo_url} size={72} /><View style={styles.flex}><Text numberOfLines={1} style={styles.name}>{application?.full_name || user?.name || "Driver"}</Text><Text style={styles.meta}>Driver account</Text></View></View>
      <AccountDetailsSummary
        rows={[
          { label: "Full legal name", value: application?.full_name || user?.name || "Not added" },
          { label: "Email", value: user?.email || "Not added" },
          { label: "Phone", value: application?.phone || user?.phone || "Not added" },
          { label: "Service city", value: application?.service_area || String(driver?.city || user?.city || "Not added") },
        ]}
        note="These details were used to verify your Driver account. Contact support to request a correction."
        onRequestChange={() => router.push({ pathname: "/(shared)/support", params: { ...productParam, subject: "Account details change" } } as never)}
      />
      <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/(shared)/verification", params: productParam } as never)} style={[styles.verification, verified && styles.verificationGood]}><View style={styles.verificationIcon}><MaterialCommunityIcons name={verified ? "shield-check" : "shield-account-outline"} size={26} color={verified ? v2Theme.colors.brandStrong : v2Theme.colors.warning} /></View><View style={styles.flex}><Text style={styles.verificationTitle}>{verified ? "Driver verified" : "Driver verification required"}</Text><Text style={styles.verificationBody}>{verified ? "Posting and passenger operations are enabled." : "Complete identity, licence, vehicle and selfie review before posting trips."}</Text></View><MaterialCommunityIcons name="chevron-right" size={21} color={v2Theme.colors.inkTertiary} /></Pressable>
      <Section title="Driver profile">
        <Row icon="car-info" title="Vehicle" value={String(driver?.vehicle || "Not added")} />
        <Row icon="map-marker-radius-outline" title="Service area" value={String(driver?.city || user?.city || "Not added")} />
        <Row icon="star-outline" title="Rating" value={driver?.rating ? Number(driver.rating).toFixed(1) : "Not rated yet"} />
      </Section>
      <Section title="Trips & passengers">
        <Pressable accessibilityRole="button" onPress={() => router.push("/(driver)/trips" as never)}><Row icon="routes" title="Trips" value="Active, upcoming and past trips" chevron /></Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push("/(driver)/availability" as never)}><Row icon="calendar-outline" title="Calendar" value="Your driving availability" chevron /></Pressable>
      </Section>
      <Section title="Settings & help">
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/(shared)/settings", params: productParam } as never)}><Row icon="cog-outline" title="Account & notifications" value="Privacy, account and alerts" chevron /></Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/(shared)/support", params: productParam } as never)}><Row icon="lifebuoy" title="Support" value="Get help with a trip or account" chevron /></Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/(shared)/safety", params: productParam } as never)}><Row icon="shield-alert-outline" title="Safety" value="Report an incident or safety concern" chevron /></Pressable>
      </Section>
      <Pressable accessibilityRole="button" onPress={signOut} style={({ pressed }) => [styles.logout, pressed && styles.pressed]}><MaterialCommunityIcons name="logout" size={21} color="#FFFFFF" /><Text style={styles.logoutText}>Logout</Text></Pressable>
    </Screen>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) { return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text><View style={styles.card}>{children}</View></View>; }
function Row({ icon, title, value, chevron }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; value: string; chevron?: boolean }) { return <View style={styles.row}><View style={styles.rowIcon}><MaterialCommunityIcons name={icon} size={21} color={v2Theme.colors.ink} /></View><View style={styles.flex}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowValue}>{value}</Text></View>{chevron ? <MaterialCommunityIcons name="chevron-right" size={21} color={v2Theme.colors.inkTertiary} /> : null}</View>; }
const styles = StyleSheet.create({ flex: { flex: 1 }, profile: { flexDirection: "row", alignItems: "center", gap: 13 }, name: { color: v2Theme.colors.ink, fontSize: 23, fontWeight: "900" }, meta: { color: v2Theme.colors.inkSecondary, fontSize: 10, marginTop: 3 }, edit: { width: 43, height: 43, borderRadius: 15, backgroundColor: v2Theme.colors.surface, alignItems: "center", justifyContent: "center" }, verification: { borderRadius: 23, backgroundColor: v2Theme.colors.warningSoft, padding: 14, flexDirection: "row", alignItems: "center", gap: 11 }, verificationGood: { backgroundColor: v2Theme.colors.brandSofter }, verificationIcon: { width: 49, height: 49, borderRadius: 17, backgroundColor: v2Theme.colors.surface, alignItems: "center", justifyContent: "center" }, verificationTitle: { color: v2Theme.colors.ink, fontSize: 14, fontWeight: "900" }, verificationBody: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14, marginTop: 3 }, section: { gap: 8 }, sectionTitle: { color: v2Theme.colors.ink, fontSize: 18, fontWeight: "900" }, card: { borderRadius: 23, backgroundColor: v2Theme.colors.surface, overflow: "hidden" }, row: { minHeight: 69, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: v2Theme.colors.line }, rowIcon: { width: 41, height: 41, borderRadius: 14, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" }, rowTitle: { color: v2Theme.colors.ink, fontSize: 11, fontWeight: "900" }, rowValue: { color: v2Theme.colors.inkSecondary, fontSize: 9, marginTop: 2 }, logout: { minHeight: 56, borderRadius: 18, backgroundColor: v2Theme.colors.danger, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 }, logoutText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" }, pressed: { opacity: 0.72 } });
