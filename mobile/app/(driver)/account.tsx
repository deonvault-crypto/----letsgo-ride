import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AccountComplianceSections } from "../../components/account/AccountComplianceSections";
import { AccountDetailsSummary } from "../../components/account/AccountDetailsSummary";
import { Avatar } from "../../components/ui/Avatar";
import { ListTile } from "../../components/ui/ListTile";
import { Screen } from "../../components/ui/Screen";
import { VerifiedBadge } from "../../components/ui/VerifiedBadge";
import { v2Theme } from "../../constants/v2Theme";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useDriver } from "../../hooks/useDriver";
import { listMyWorkerApplications } from "../../services/operationsService";
import { WorkerApplication } from "../../types/operations.types";

const DRIVER_BLACK = "#111111";

export default function DriverAccountScreen() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const { driver } = useDriver();
  const [application, setApplication] = useState<WorkerApplication | null>(null);
  const verified = Boolean(driver?.verified || driver?.verification_status === "approved");
  const hasProfilePhoto = Boolean(user?.profile_photo_url?.trim());
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
  const requestAccountChange = () => router.push({
    pathname: "/(shared)/support",
    params: { ...productParam, subject: "Account details change" },
  } as never);
  const openProfile = () => router.push({
    pathname: "/(shared)/edit-profile",
    params: productParam,
  } as never);

  return (
    <Screen title="Driver account" navRole="driver" showNotifications>
      <View style={styles.profileCard}>
        <Avatar name={displayName} imageUri={user?.profile_photo_url} size={76} tone="neutral" />
        <View style={styles.profileCopy}>
          <View style={styles.nameLine}>
            <Text numberOfLines={1} style={styles.name}>{displayName}</Text>
            <VerifiedBadge verified={verified} size="medium" />
          </View>
          <Text numberOfLines={1} style={styles.meta}>Driver · {serviceArea}</Text>
          <Text style={styles.photoState}>{hasProfilePhoto ? "Profile photo added" : "Profile photo required"}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit Driver profile"
          onPress={openProfile}
          style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="pencil-outline" size={20} color={DRIVER_BLACK} />
        </Pressable>
      </View>

      {!hasProfilePhoto ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add required Driver profile photo"
          onPress={openProfile}
          style={({ pressed }) => [styles.requiredCard, pressed && styles.pressed]}
        >
          <View style={styles.requiredIcon}>
            <MaterialCommunityIcons name="camera-plus-outline" size={23} color={DRIVER_BLACK} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.requiredTitle}>Add your profile photo</Text>
            <Text style={styles.requiredBody}>A clear profile photo is required before a Driver can go online for new work.</Text>
          </View>
          <MaterialCommunityIcons name="arrow-right" size={20} color={DRIVER_BLACK} />
        </Pressable>
      ) : null}

      <View style={styles.essentials}>
        <Essential icon="car-info" label="Vehicle" value={vehicle} />
        <Essential icon="map-marker-radius-outline" label="Area" value={serviceArea} />
        <Essential icon="star-outline" label="Rating" value={rating} />
      </View>

      {!verified ? (
        <ListTile
          tone="neutral"
          icon="shield-account-outline"
          title="Verification required"
          subtitle="Complete identity, licence, vehicle and selfie review before driving."
          onPress={() => router.push({ pathname: "/(shared)/verification", params: productParam } as never)}
        />
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Driver profile</Text>
        <View style={styles.sectionRows}>
          <ListTile
            tone="neutral"
            icon="account-circle-outline"
            title="Profile & photo"
            subtitle={hasProfilePhoto ? "Photo and verified identity details" : "Profile photo required"}
            onPress={openProfile}
          />
          <ListTile
            tone="neutral"
            icon="car-cog"
            title="Vehicle & documents"
            subtitle={verified ? "Approved Driver records" : "Review verification requirements"}
            onPress={() => router.push({ pathname: "/(shared)/verification", params: productParam } as never)}
          />
          <ListTile
            tone="neutral"
            icon="wallet-outline"
            title="Wallet & settlement"
            subtitle="Weekly Driver balance and payment history"
            onPress={() => router.push("/(shared)/wallet" as never)}
          />
          <ListTile
            tone="neutral"
            icon="cog-outline"
            title="Settings"
            subtitle="Notifications and security"
            onPress={() => router.push({ pathname: "/(shared)/settings", params: productParam } as never)}
          />
        </View>
      </View>

      <AccountDetailsSummary
        rows={[
          { label: "Full legal name", value: displayName },
          { label: "Email", value: user?.email || "Not added" },
          { label: "Phone", value: application?.phone || user?.phone || "Not added" },
          { label: "Service city", value: serviceArea },
        ]}
        note="These identity details support your Driver verification. Contact LetsGoRide Support to request a correction."
        onRequestChange={requestAccountChange}
      />

      <AccountComplianceSections product="driver" />
    </Screen>
  );
}

function Essential({ icon, label, value }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.essential}>
      <MaterialCommunityIcons name={icon} size={20} color={DRIVER_BLACK} />
      <Text style={styles.essentialLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.essentialValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  profileCard: {
    minHeight: 106,
    borderRadius: 28,
    backgroundColor: v2Theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: v2Theme.colors.line,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  profileCopy: { flex: 1, gap: 4 },
  nameLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { flexShrink: 1, color: DRIVER_BLACK, fontSize: 21, fontWeight: "900", letterSpacing: -0.45 },
  meta: { color: v2Theme.colors.inkSecondary, fontSize: 11, fontWeight: "700" },
  photoState: { color: DRIVER_BLACK, fontSize: 9, fontWeight: "900" },
  editButton: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: v2Theme.colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  requiredCard: {
    minHeight: 82,
    borderRadius: 22,
    backgroundColor: "rgba(17,17,17,0.055)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(17,17,17,0.12)",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  requiredIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  requiredTitle: { color: DRIVER_BLACK, fontSize: 13, fontWeight: "900" },
  requiredBody: { color: v2Theme.colors.inkSecondary, fontSize: 9, lineHeight: 14, marginTop: 2 },
  essentials: { flexDirection: "row", gap: 8 },
  essential: {
    flex: 1,
    minHeight: 94,
    borderRadius: 21,
    backgroundColor: v2Theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: v2Theme.colors.line,
    padding: 11,
    gap: 4,
  },
  essentialLabel: { color: v2Theme.colors.inkTertiary, fontSize: 8, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.5 },
  essentialValue: { color: DRIVER_BLACK, fontSize: 11, fontWeight: "900", marginTop: 1 },
  section: { gap: 9 },
  sectionTitle: { color: DRIVER_BLACK, fontSize: 18, fontWeight: "900", letterSpacing: -0.25 },
  sectionRows: { gap: 8 },
  pressed: { opacity: 0.7 },
});
