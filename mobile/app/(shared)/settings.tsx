import { Alert, Modal, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { ReactNode, useCallback, useState } from "react";

import { AppButton } from "../../components/ui/AppButton";
import { ListTile } from "../../components/ui/ListTile";
import { Screen } from "../../components/ui/Screen";
import { colors } from "../../constants/colors";
import { legalUrls } from "../../constants/legal";
import { spacing } from "../../constants/spacing";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { deleteAccount, logoutToGuest } from "../../services/authService";
import {
  biometricAvailable,
  biometricLabel,
  disableBiometricLogin,
  enableBiometricLogin,
  isBiometricEnabled,
} from "../../services/biometricService";
import { getNotificationPreferences, updateNotificationPreferences } from "../../services/notificationService";
import {
  enablePhoneNotifications,
  hasSeenNotificationExplanation,
  markNotificationExplanationSeen,
  phoneNotificationStatus,
} from "../../services/pushNotificationService";
import { NotificationPreferences } from "../../types/notification.types";
import { formatStatus } from "../../utils/formatStatus";
import { openExternalUrl } from "../../utils/openExternalUrl";

type PreferenceKey =
  | "trip_updates"
  | "booking_requests"
  | "messages"
  | "verification_updates"
  | "support_replies"
  | "safety_alerts"
  | "marketing_messages";

const preferenceRows: Array<{ key: PreferenceKey; title: string; subtitle: string; defaultValue: boolean }> = [
  { key: "trip_updates", title: "Service updates", subtitle: "Ride, Food and Courier progress updates.", defaultValue: true },
  { key: "booking_requests", title: "Ride requests", subtitle: "Seat request and driver response updates.", defaultValue: true },
  { key: "messages", title: "Messages", subtitle: "New LetsGoRide conversation messages.", defaultValue: true },
  { key: "verification_updates", title: "Verification updates", subtitle: "Application and document review updates.", defaultValue: true },
  { key: "support_replies", title: "Support replies", subtitle: "Updates from LetsGoRide support.", defaultValue: true },
  { key: "safety_alerts", title: "Safety alerts", subtitle: "Important account and service safety notices.", defaultValue: true },
  { key: "marketing_messages", title: "Product news", subtitle: "Occasional LetsGoRide product updates.", defaultValue: false },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const navRole: "customer" | "driver" | undefined = user?.role === "driver"
    ? "driver"
    : user?.role === "courier" || user?.role === "merchant" || user?.role === "admin"
      ? undefined
      : "customer";
  const verificationStatus = user?.verification_status || "not_started";

  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricText, setBiometricText] = useState("Use biometrics");
  const [biometricSaving, setBiometricSaving] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [preferenceSaving, setPreferenceSaving] = useState<PreferenceKey | "">("");
  const [phoneNotificationEnabled, setPhoneNotificationEnabled] = useState(false);
  const [phoneNotificationMessage, setPhoneNotificationMessage] = useState("");
  const [notificationExplanationOpen, setNotificationExplanationOpen] = useState(false);
  const [pushSaving, setPushSaving] = useState(false);
  const [biometricExplanationOpen, setBiometricExplanationOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleteSaving, setDeleteSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function loadSettingsState() {
        try {
          setBiometricSupported(await biometricAvailable());
          setBiometricEnabled(await isBiometricEnabled());
          setBiometricText(await biometricLabel());
        } catch {
          setBiometricSupported(false);
          setBiometricEnabled(false);
        }

        getNotificationPreferences().then((data) => active && setPreferences(data)).catch(() => undefined);
        try {
          const state = await phoneNotificationStatus();
          if (!active) return;
          setPhoneNotificationEnabled(state.enabled);
          setPhoneNotificationMessage(state.message || (state.enabled ? "Phone notifications are enabled." : "Phone notifications are off."));
        } catch {
          if (active) {
            setPhoneNotificationEnabled(false);
            setPhoneNotificationMessage("Enable notifications in device settings");
          }
        }
      }

      loadSettingsState();
      return () => {
        active = false;
      };
    }, []),
  );

  async function updatePreference(key: PreferenceKey, value: boolean) {
    if (!phoneNotificationEnabled) return;
    try {
      setPreferenceSaving(key);
      setPreferences(await updateNotificationPreferences({ [key]: value }));
    } finally {
      setPreferenceSaving("");
    }
  }

  async function requestPhoneNotifications() {
    try {
      setPushSaving(true);
      setPhoneNotificationMessage("");
      const state = await enablePhoneNotifications();
      setPhoneNotificationEnabled(state.enabled);
      setPhoneNotificationMessage(state.message || (state.enabled ? "Phone notifications are enabled." : ""));
    } catch (err) {
      setPhoneNotificationEnabled(false);
      setPhoneNotificationMessage(err instanceof Error ? err.message : "Could not enable phone notifications.");
    } finally {
      setPushSaving(false);
    }
  }

  async function enableNotifications() {
    if (!(await hasSeenNotificationExplanation())) {
      setNotificationExplanationOpen(true);
      return;
    }
    await requestPhoneNotifications();
  }

  async function confirmNotificationExplanation() {
    await markNotificationExplanationSeen();
    setNotificationExplanationOpen(false);
    await requestPhoneNotifications();
  }

  async function skipNotificationExplanation() {
    await markNotificationExplanationSeen();
    setNotificationExplanationOpen(false);
    setPhoneNotificationMessage("You can enable phone notifications later from Settings.");
  }

  function confirmLogout() {
    Alert.alert("Logout", "You will be signed out of this LetsGoRide account.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          await logoutToGuest(router);
        },
      },
    ]);
  }

  async function confirmDeleteAccount() {
    if (deleteText.trim().toUpperCase() !== "DELETE") return;
    try {
      setDeleteSaving(true);
      await deleteAccount();
      await disableBiometricLogin();
      setDeleteModalOpen(false);
      Alert.alert("Account deleted", "Your account access and non-retained profile data have been removed.");
      router.replace("/(customer)/home" as never);
    } catch {
      Alert.alert("Delete account", "Could not delete your account. Please try again or contact support.");
    } finally {
      setDeleteSaving(false);
    }
  }

  async function setBiometricLoginEnabled(nextValue: boolean) {
    try {
      setBiometricSaving(true);
      if (nextValue) {
        await enableBiometricLogin();
        setBiometricEnabled(true);
        Alert.alert("Biometric login enabled", `${biometricText} is now available on this device.`);
      } else {
        await disableBiometricLogin();
        setBiometricEnabled(false);
        Alert.alert("Biometric login disabled", "LetsGoRide will ask for your email and password next time.");
      }
    } catch (err) {
      setBiometricEnabled(await isBiometricEnabled());
      Alert.alert("Biometric login", err instanceof Error ? err.message : "Could not update biometric login.");
    } finally {
      setBiometricSaving(false);
    }
  }

  async function toggleBiometrics(nextValue: boolean) {
    if (nextValue && !biometricEnabled) {
      setBiometricExplanationOpen(true);
      return;
    }
    await setBiometricLoginEnabled(nextValue);
  }

  async function confirmBiometricExplanation() {
    setBiometricExplanationOpen(false);
    await setBiometricLoginEnabled(true);
  }

  return (
    <Screen title="Settings" showBack fallbackRoute="/(shared)/account" navRole={navRole}>
      <Modal visible={deleteModalOpen} transparent animationType="fade" onRequestClose={() => setDeleteModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Delete account?</Text>
            <Text style={styles.body}>Deleting your account signs you out and removes or de-identifies your profile, contact details, saved preferences, device registrations and messages you sent. Limited completed service, safety, support, verification, fraud-prevention and legal records may be retained as described in the Privacy Policy.</Text>
            <Text style={styles.modalHelper}>Type DELETE to confirm.</Text>
            <TextInput value={deleteText} onChangeText={setDeleteText} autoCapitalize="characters" placeholder="DELETE" placeholderTextColor={colors.mutedText} style={styles.confirmInput} />
            <View style={styles.modalActions}>
              <AppButton title="Cancel" variant="secondary" onPress={() => setDeleteModalOpen(false)} />
              <AppButton title="Delete account" variant="danger" loading={deleteSaving} disabled={deleteText.trim().toUpperCase() !== "DELETE"} onPress={confirmDeleteAccount} />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={notificationExplanationOpen} transparent animationType="fade" onRequestClose={skipNotificationExplanation}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Enable notifications?</Text>
            <Text style={styles.body}>LetsGoRide uses notifications for Ride, Food and Courier progress, messages, verification updates, support replies, and safety alerts.</Text>
            <View style={styles.modalActions}>
              <AppButton title="Enable notifications" loading={pushSaving} onPress={confirmNotificationExplanation} />
              <AppButton title="Not now" variant="secondary" onPress={skipNotificationExplanation} />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={biometricExplanationOpen} transparent animationType="fade" onRequestClose={() => setBiometricExplanationOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Biometric login</Text>
            <Text style={styles.body}>Face ID or your device biometric only unlocks this LetsGoRide account on this device.</Text>
            <View style={styles.modalActions}>
              <AppButton title="Enable biometric login" loading={biometricSaving} onPress={confirmBiometricExplanation} />
              <AppButton title="Cancel" variant="secondary" onPress={() => setBiometricExplanationOpen(false)} />
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.headerCopy}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.body}>Manage this account, privacy, notifications, and device security.</Text>
      </View>

      <Section title="Account">
        <ListTile
          icon="account-edit-outline"
          title="Account details"
          subtitle={user?.role === "passenger" ? "Photo, contact details, city, and preferences" : "Saved identity details and profile photo"}
          onPress={() => router.push("/(shared)/edit-profile" as never)}
        />
        {user?.role === "driver" ? (
          <ListTile icon="shield-check-outline" title="Driver verification status" subtitle={formatStatus(verificationStatus)} onPress={() => router.push("/(shared)/verification" as never)} />
        ) : null}
      </Section>

      <Section title="Notifications" subtitle="Choose which updates LetsGoRide should send you.">
        <View style={styles.notificationStatus}>
          <View style={styles.toggleCopy}>
            <Text style={styles.toggleTitle}>Phone notifications: {phoneNotificationEnabled ? "On" : "Off"}</Text>
            <Text style={styles.toggleSubtitle}>Phone alerts for service progress, messages, support, and safety updates.</Text>
            {phoneNotificationMessage ? <Text style={[styles.noticeText, !phoneNotificationEnabled && styles.offNoticeText]}>{phoneNotificationMessage}</Text> : null}
          </View>
          {!phoneNotificationEnabled ? <AppButton title="Enable phone notifications" variant="secondary" loading={pushSaving} onPress={enableNotifications} /> : null}
        </View>

        {phoneNotificationEnabled ? preferenceRows.map((row) => {
          const value = phoneNotificationEnabled ? preferences?.[row.key] ?? row.defaultValue : false;
          const disabled = !phoneNotificationEnabled || preferenceSaving === row.key;
          return (
            <View key={row.key} style={[styles.toggleRow, disabled && styles.disabledToggleRow]}>
              <View style={styles.toggleCopy}>
                <Text style={styles.toggleTitle}>{row.title}</Text>
                <Text style={styles.toggleSubtitle}>{row.subtitle}</Text>
              </View>
              <Switch
                accessibilityLabel={row.title}
                accessibilityState={{ disabled, checked: value }}
                value={value}
                disabled={disabled}
                onValueChange={(next) => updatePreference(row.key, next)}
                trackColor={{ false: "#D9D0C3", true: "rgba(17,139,68,0.36)" }}
                thumbColor={value ? colors.primaryGreen : "#FFFDF8"}
              />
            </View>
          );
        }) : <View style={styles.categoriesLocked}><Text style={styles.categoriesLockedTitle}>Notification categories</Text><Text style={styles.toggleSubtitle}>Enable phone notifications first, then choose exactly which updates you want.</Text></View>}
      </Section>

      <Section title="Security & Privacy">
        <View style={styles.toggleRow}>
          <View style={styles.toggleCopy}>
            <Text style={styles.toggleTitle}>Biometric login</Text>
            <Text style={styles.toggleSubtitle}>{biometricSupported ? `${biometricText} to unlock LetsGoRide on this device.` : "Biometrics are not available or not enrolled on this device."}</Text>
          </View>
          <Switch
            accessibilityLabel="Biometric login"
            accessibilityState={{ disabled: !biometricSupported || biometricSaving, checked: biometricEnabled }}
            value={biometricEnabled}
            disabled={!biometricSupported || biometricSaving}
            onValueChange={toggleBiometrics}
            trackColor={{ false: "#D9D0C3", true: "rgba(17,139,68,0.36)" }}
            thumbColor={biometricEnabled ? colors.primaryGreen : "#FFFDF8"}
          />
        </View>
        <ListTile icon="lock-outline" title="Privacy Policy" onPress={() => openExternalUrl(legalUrls.privacy)} />
        <ListTile icon="file-document-outline" title="Terms of Use" onPress={() => openExternalUrl(legalUrls.terms)} />
        <ListTile icon="shield-outline" title="Safety Policy" onPress={() => openExternalUrl(legalUrls.safety)} />
      </Section>

      <Section title="Support & Safety">
        <ListTile icon="lifebuoy" title="Support" subtitle="Contact LetsGoRide support" onPress={() => router.push("/(shared)/support" as never)} />
        <ListTile icon="shield-alert-outline" title="Safety Center" subtitle="Report issues and review platform safety" onPress={() => router.push("/(shared)/safety" as never)} />
      </Section>

      <Section title="Account Control">
        <ListTile icon="logout" title="Logout" subtitle="Sign out on this device" onPress={confirmLogout} danger />
        <ListTile
          icon="delete-outline"
          title="Delete account"
          subtitle="Delete access and remove or de-identify personal data"
          onPress={() => {
            setDeleteText("");
            setDeleteModalOpen(true);
          }}
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
  headerCopy: { gap: spacing.sm },
  title: { color: colors.whiteText, fontWeight: "900", fontSize: 30 },
  body: { color: colors.mutedText, lineHeight: 21 },
  section: { gap: spacing.sm },
  sectionHeader: { gap: 3, paddingHorizontal: 2 },
  sectionTitle: { color: colors.whiteText, fontSize: 18, fontWeight: "900" },
  sectionSubtitle: { color: colors.mutedText, fontSize: 13, lineHeight: 18 },
  toggleRow: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.elevated },
  disabledToggleRow: { opacity: 0.58 },
  notificationStatus: { gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.elevated },
  categoriesLocked: { minHeight: 76, justifyContent: "center", gap: 5, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderRadius: 20, backgroundColor: colors.elevated },
  categoriesLockedTitle: { color: colors.whiteText, fontWeight: "900", fontSize: 15 },
  noticeText: { color: colors.primaryGreen, fontSize: 12, fontWeight: "800" },
  offNoticeText: { color: colors.mutedText },
  toggleCopy: { flex: 1, gap: 3 },
  toggleTitle: { color: colors.whiteText, fontWeight: "900", fontSize: 15 },
  toggleSubtitle: { color: colors.mutedText, fontSize: 12, lineHeight: 17 },
  modalBackdrop: { flex: 1, justifyContent: "center", padding: spacing.xl, backgroundColor: "rgba(17,20,23,0.26)" },
  modalCard: { gap: spacing.md, borderRadius: 28, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: spacing.xl },
  modalTitle: { color: colors.whiteText, fontWeight: "900", fontSize: 24 },
  modalHelper: { color: colors.whiteText, fontWeight: "800" },
  confirmInput: { minHeight: 54, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.elevated, paddingHorizontal: spacing.lg, color: colors.whiteText, fontSize: 16, fontWeight: "900" },
  modalActions: { gap: spacing.sm },
});
