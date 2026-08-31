import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";

import { AccountDetailsSummary } from "../../components/account/AccountDetailsSummary";
import { AccountComplianceSections } from "../../components/account/AccountComplianceSections";
import { Avatar } from "../../components/ui/Avatar";
import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { getPreferredNavigationApp, NavigationAppPreference, setPreferredNavigationApp } from "../../services/appPreferenceService";
import { getCourierProfile, listMyWorkerApplications } from "../../services/operationsService";
import { CourierProfile, WorkerApplication } from "../../types/operations.types";

export default function CourierAccountScreen() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [profile, setProfile] = useState<CourierProfile | null>(null);
  const [application, setApplication] = useState<WorkerApplication | null>(null);
  const [navigationApp, setNavigationApp] = useState<NavigationAppPreference>("system");
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const [nextProfile, applications, preference] = await Promise.all([getCourierProfile(), listMyWorkerApplications(), getPreferredNavigationApp()]);
      setProfile(nextProfile); setApplication(applications.find((item) => item.product === "courier") || null); setNavigationApp(preference); setError(null);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load courier account."); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  async function chooseNavigation(value: NavigationAppPreference) { setNavigationApp(await setPreferredNavigationApp(value)); }
  const productParam = { product: "courier" };
  const photoApproved = user?.profile_photo_verified === true;
  const photoPending = user?.profile_photo_review_status === "pending";
  const photoRejected = user?.profile_photo_review_status === "rejected";
  const photoState = photoApproved ? "Photo approved" : photoPending ? "Photo awaiting review" : photoRejected ? "Photo needs replacement" : "Profile photo required";
  const profileApproved = profile?.status === "APPROVED";
  return (
    <Screen title="Account" navRole="courier" onRefresh={load} refreshing={false}>
      <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/(shared)/edit-profile", params: productParam } as never)} style={({ pressed }) => [styles.profile, pressed && styles.pressed]}>
        <Avatar name={application?.full_name || user?.name || "Courier"} imageUri={user?.profile_photo_url || user?.profile_photo_pending_url} size={72} />
        <View style={styles.profileCopy}><Text numberOfLines={1} style={styles.name}>{application?.full_name || user?.name || "Courier"}</Text><Text style={styles.contact}>Courier account · {photoState}</Text></View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={v2Theme.colors.inkTertiary} />
      </Pressable>
      <AccountDetailsSummary rows={[{ label: "Full legal name", value: application?.full_name || user?.name || "Not added" }, { label: "Email", value: user?.email || "Not added" }, { label: "Phone", value: application?.phone || user?.phone || "Not added" }, { label: "Service city", value: application?.service_area || profile?.service_area || user?.city || "Not added" }]} note="These details were used to verify your Courier account. Contact support to request a correction." onRequestChange={() => router.push({ pathname: "/(shared)/support", params: { ...productParam, subject: "Account details change" } } as never)} />
      {error ? <Pressable accessibilityRole="button" onPress={load} style={styles.error}><Text style={styles.errorText}>{error}</Text><Text style={styles.retry}>Retry</Text></Pressable> : null}
      <View style={[styles.approval, profileApproved && photoApproved && styles.approvalGood]}><View style={styles.approvalIcon}><MaterialCommunityIcons name={profileApproved && photoApproved ? "shield-check" : "shield-outline"} size={25} color={profileApproved && photoApproved ? v2Theme.colors.brandStrong : v2Theme.colors.warning} /></View><View style={styles.flex}><Text style={styles.approvalTitle}>{profileApproved ? (photoApproved ? "Courier ready" : "Courier approved · photo check required") : "Courier review in progress"}</Text><Text style={styles.approvalBody}>{profileApproved ? (photoApproved ? "Online work and shift booking are enabled." : photoPending ? "Your application is approved. New online work opens after the submitted profile photo is approved." : photoRejected ? "Your application is approved, but the profile photo must be replaced and approved before new online work." : "Your application is approved. Add an Admin-approved profile photo before starting new online work.") : "Work access stays locked until admin approval."}</Text></View></View>
      <Section title="Work profile"><AccountRow icon="motorbike" title="Vehicle" value={profile?.vehicle_description || profile?.transport_mode || "Not added"} /><AccountRow icon="map-marker-radius-outline" title="Working area" value={profile?.service_area || user?.city || "Not added"} /><AccountRow icon="file-document-check-outline" title="Identity & documents" value={application ? `${application.documents.length} reviewed files · ${application.status.replaceAll("_", " ")}` : "No linked application record"} /></Section>
      <Section title="Earnings & payouts">
        <Pressable accessibilityRole="button" onPress={() => router.push("/(courier)/earnings" as never)}><AccountRow icon="chart-line" title="Earnings" value="Today, week, month and completed jobs" chevron /></Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push("/(shared)/wallet" as never)}><AccountRow icon="wallet-outline" title="Wallet & payout methods" value="Balance, ledger, EcoCash and bank account" chevron /></Pressable>
      </Section>
      <Section title="Navigation"><Text style={styles.helper}>Used by the external-navigation button during a live delivery.</Text><View style={styles.preferenceRow}><Preference label="System" value="system" active={navigationApp === "system"} onPress={chooseNavigation} /><Preference label="Google" value="google" active={navigationApp === "google"} onPress={chooseNavigation} /><Preference label="Apple" value="apple" active={navigationApp === "apple"} onPress={chooseNavigation} /></View></Section>
      <Section title="Preferences"><Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/(shared)/settings", params: productParam } as never)}><AccountRow icon="account-cog-outline" title="Account & notifications" value="Account control, delivery, shift and support settings" chevron /></Pressable><AccountRow icon="translate" title="Language" value="English" /></Section>
      <AccountComplianceSections product="courier" />
    </Screen>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) { return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text><View style={styles.sectionCard}>{children}</View></View>; }
function AccountRow({ icon, title, value, chevron }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; value: string; chevron?: boolean }) { return <View style={styles.row}><View style={styles.rowIcon}><MaterialCommunityIcons name={icon} size={21} color={v2Theme.colors.ink} /></View><View style={styles.flex}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowValue}>{value}</Text></View>{chevron ? <MaterialCommunityIcons name="chevron-right" size={21} color={v2Theme.colors.inkTertiary} /> : null}</View>; }
function Preference({ label, value, active, onPress }: { label: string; value: NavigationAppPreference; active: boolean; onPress: (value: NavigationAppPreference) => void }) { return <Pressable accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={() => onPress(value)} style={[styles.preference, active && styles.preferenceActive]}><Text style={[styles.preferenceText, active && styles.preferenceTextActive]}>{label}</Text></Pressable>; }
const styles = StyleSheet.create({ flex: { flex: 1 }, profile: { flexDirection: "row", alignItems: "center", gap: 13, paddingVertical: 4 }, profileCopy: { flex: 1, gap: 3 }, name: { color: v2Theme.colors.ink, fontSize: 23, fontWeight: "900", letterSpacing: -0.6 }, contact: { color: v2Theme.colors.inkSecondary, fontSize: 10 }, error: { borderRadius: 17, backgroundColor: v2Theme.colors.dangerSoft, padding: 12, flexDirection: "row", gap: 9 }, errorText: { flex: 1, color: v2Theme.colors.danger, fontSize: 10, fontWeight: "700" }, retry: { color: v2Theme.colors.danger, fontSize: 10, fontWeight: "900" }, approval: { borderRadius: 23, backgroundColor: v2Theme.colors.warningSoft, padding: 14, flexDirection: "row", alignItems: "center", gap: 11 }, approvalGood: { backgroundColor: v2Theme.colors.brandSofter }, approvalIcon: { width: 48, height: 48, borderRadius: 17, backgroundColor: v2Theme.colors.surface, alignItems: "center", justifyContent: "center" }, approvalTitle: { color: v2Theme.colors.ink, fontSize: 14, fontWeight: "900" }, approvalBody: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15, marginTop: 3 }, section: { gap: 8 }, sectionTitle: { color: v2Theme.colors.ink, fontSize: 18, fontWeight: "900" }, sectionCard: { borderRadius: 23, backgroundColor: v2Theme.colors.surface, overflow: "hidden" }, row: { minHeight: 69, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: v2Theme.colors.line }, rowIcon: { width: 41, height: 41, borderRadius: 14, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" }, rowTitle: { color: v2Theme.colors.ink, fontSize: 11, fontWeight: "900" }, rowValue: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14, marginTop: 2 }, helper: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14, paddingHorizontal: 12, paddingTop: 11 }, preferenceRow: { flexDirection: "row", gap: 7, padding: 11 }, preference: { flex: 1, minHeight: 42, borderRadius: 13, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" }, preferenceActive: { backgroundColor: "#111111" }, preferenceText: { color: v2Theme.colors.inkSecondary, fontSize: 9, fontWeight: "900" }, preferenceTextActive: { color: "#FFFFFF" }, pressed: { opacity: 0.72 } });
