import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";

import { AccountDetailsSummary } from "../../components/account/AccountDetailsSummary";
import { AccountComplianceSections } from "../../components/account/AccountComplianceSections";
import { Avatar } from "../../components/ui/Avatar";
import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";
import { useMerchantRestaurant } from "../../contexts/MerchantRestaurantContext";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { listMyWorkerApplications } from "../../services/operationsService";
import { WorkerApplication } from "../../types/operations.types";

export default function MerchantAccountScreen() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const merchant = useMerchantRestaurant();
  const store = merchant.selected;
  const [application, setApplication] = useState<WorkerApplication | null>(null);
  const productParam = { product: "merchant" };

  useFocusEffect(useCallback(() => {
    let active = true;
    void listMyWorkerApplications().then((items) => {
      if (active) setApplication(items.find((item) => item.product === "merchant") || null);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []));

  function requestChange() {
    router.push({ pathname: "/(shared)/support", params: { ...productParam, subject: "Account details change" } } as never);
  }

  return (
    <Screen title="Account" navRole="merchant">
      <View style={styles.profile}>
        <Avatar name={application?.full_name || user?.name || "Merchant"} imageUri={user?.profile_photo_url} size={72} />
        <View style={styles.flex}>
          <Text style={styles.name}>{application?.full_name || user?.name || "Merchant"}</Text>
          <Text style={styles.meta}>Merchant account</Text>
        </View>
      </View>

      <AccountDetailsSummary
        rows={[
          { label: "Account holder", value: application?.full_name || user?.name || "Not added" },
          { label: "Email", value: user?.email || "Not added" },
          { label: "Phone", value: application?.phone || user?.phone || "Not added" },
          { label: "Business city", value: application?.service_area || user?.city || "Not added" },
        ]}
        note="These details were used to verify your Merchant account. Contact support to request a correction."
        onRequestChange={requestChange}
      />

      <View style={styles.business}>
        <View style={styles.businessIcon}><MaterialCommunityIcons name="storefront-outline" size={27} color={v2Theme.colors.brandStrong} /></View>
        <View style={styles.flex}>
          <Text style={styles.businessName}>{application?.business_name || store?.name || "Business onboarding"}</Text>
          <Text style={styles.businessState}>{store ? `${store.status.replaceAll("_", " ")} · ${store.address}` : "Add a restaurant to begin review"}</Text>
        </View>
      </View>

      <Section title="Business identity">
        <Row icon="briefcase-outline" title="Registered business" value={application?.business_name || store?.name || "Not added"} />
        <Row icon="file-document-outline" title="Registration number" value={application?.business_registration_number || store?.business_registration_number || "Not added"} />
        <Row icon="map-marker-outline" title="Business address" value={application?.business_address || store?.address || "Not added"} />
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/(shared)/worker-application", params: productParam } as never)}>
          <Row icon="file-check-outline" title="Merchant application" value={application ? application.status.replaceAll("_", " ") : "Open application record"} chevron />
        </Pressable>
      </Section>

      <Section title="Store operations">
        <Pressable accessibilityRole="button" onPress={() => router.push("/(merchant)/store" as never)}><Row icon="clock-outline" title="Hours & availability" value="Daily store controls" chevron /></Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push("/(merchant)/menu" as never)}><Row icon="silverware-fork-knife" title="Menu" value="Items, prices and availability" chevron /></Pressable>
      </Section>

      <Section title="Settings">
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/(shared)/settings", params: productParam } as never)}><Row icon="cog-outline" title="Account & notifications" value="Privacy, account and alerts" chevron /></Pressable>
      </Section>
      <AccountComplianceSections product="merchant" />
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text><View style={styles.card}>{children}</View></View>;
}

function Row({ icon, title, value, chevron }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; value: string; chevron?: boolean }) {
  return <View style={styles.row}><View style={styles.rowIcon}><MaterialCommunityIcons name={icon} size={21} color={v2Theme.colors.ink} /></View><View style={styles.flex}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowValue}>{value}</Text></View>{chevron ? <MaterialCommunityIcons name="chevron-right" size={21} color={v2Theme.colors.inkTertiary} /> : null}</View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  profile: { flexDirection: "row", alignItems: "center", gap: 13 },
  name: { color: v2Theme.colors.ink, fontSize: 23, fontWeight: "900" },
  meta: { color: v2Theme.colors.inkSecondary, fontSize: 10, marginTop: 3 },
  business: { borderRadius: 24, backgroundColor: v2Theme.colors.brandSofter, padding: 14, flexDirection: "row", alignItems: "center", gap: 11 },
  businessIcon: { width: 51, height: 51, borderRadius: 18, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" },
  businessName: { color: v2Theme.colors.ink, fontSize: 15, fontWeight: "900" },
  businessState: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14, marginTop: 3 },
  section: { gap: 8 },
  sectionTitle: { color: v2Theme.colors.ink, fontSize: 18, fontWeight: "900" },
  card: { borderRadius: 23, backgroundColor: v2Theme.colors.surface, overflow: "hidden" },
  row: { minHeight: 69, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: v2Theme.colors.line },
  rowIcon: { width: 41, height: 41, borderRadius: 14, backgroundColor: v2Theme.colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  rowTitle: { color: v2Theme.colors.ink, fontSize: 11, fontWeight: "900" },
  rowValue: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14, marginTop: 2 },
});
