import { usePathname } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AppState, Modal, Platform, StyleSheet, Text, View } from "react-native";

import { AppButton } from "../ui/AppButton";
import { v2Theme } from "../../constants/v2Theme";
import { useSession } from "../../contexts/SessionContext";
import { biometricLabel, biometricReminderDue, enableBiometricLogin, snoozeBiometricReminder } from "../../services/biometricService";
import { getForegroundLocationPermissionState, LocationPermissionState, openLocationSettings, requestForegroundLocationPermission } from "../../services/locationService";
import { clearLocationReminderSnooze, locationReminderDue, snoozeLocationReminder } from "../../services/permissionReminderService";
import { enablePhoneNotifications, notificationReminderDue, openPhoneNotificationSettings, phoneNotificationStatus, PushRegistrationState, snoozeNotificationReminder } from "../../services/pushNotificationService";

type PromptKind = "notifications" | "location" | "biometric" | null;

function isSafePromptPath(pathname: string) {
  return pathname.endsWith("/home") || pathname.endsWith("/account") || pathname.endsWith("/dashboard");
}

export function PermissionReminder() {
  const pathname = usePathname();
  const { user, loading } = useSession();
  const isBootstrapPath = pathname === "/";
  const [pushState, setPushState] = useState<PushRegistrationState | null>(null);
  const [locationState, setLocationState] = useState<LocationPermissionState | null>(null);
  const [prompt, setPrompt] = useState<PromptKind>(null);
  const [message, setMessage] = useState("");
  const [biometricText, setBiometricText] = useState("Use biometrics");
  const [saving, setSaving] = useState(false);
  const shownThisSession = useRef<string | null>(null);
  const openedSettings = useRef<"notifications" | "location" | null>(null);
  const notificationActionInFlight = useRef(false);
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = user?.id || null;

  useEffect(() => {
    if (Platform.OS === "web") return undefined;
    let active = true;
    if (loading || !user?.id || isBootstrapPath) {
      setPushState(null); setLocationState(null); setPrompt(null); setMessage(""); shownThisSession.current = null;
      return undefined;
    }
    if (shownThisSession.current && !shownThisSession.current.startsWith(`${user.id}:`)) shownThisSession.current = null;
    void Promise.all([phoneNotificationStatus(), getForegroundLocationPermissionState()]).then(([push, location]) => {
      if (!active) return;
      setPushState(push); setLocationState(location);
      if (location.enabled) void clearLocationReminderSnooze();
    }).catch(() => undefined);
    return () => { active = false; };
  }, [isBootstrapPath, loading, user?.id]);

  useEffect(() => {
    if (Platform.OS === "web") return undefined;
    let appActive = AppState.currentState === "active";
    const subscription = AppState.addEventListener("change", (nextState) => {
      const resumed = !appActive && nextState === "active";
      appActive = nextState === "active";
      if (!resumed || !openedSettings.current || !userIdRef.current) return;
      const opened = openedSettings.current;
      openedSettings.current = null;
      if (opened === "notifications") {
        void phoneNotificationStatus().then((state) => { setPushState(state); if (state.enabled) { setMessage(""); setPrompt(null); } }).catch(() => undefined);
      } else {
        void getForegroundLocationPermissionState().then((state) => { setLocationState(state); if (state.enabled) { void clearLocationReminderSnooze(); setMessage(""); setPrompt(null); } }).catch(() => undefined);
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS === "web" || loading || !user?.id || !pushState || !locationState || prompt || shownThisSession.current || !isSafePromptPath(pathname)) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        if (cancelled || !user?.id) return;
        if (!pushState.enabled && await notificationReminderDue()) {
          shownThisSession.current = `${user.id}:notifications`;
          setMessage(""); setPrompt("notifications"); return;
        }
        if (!locationState.enabled && await locationReminderDue()) {
          shownThisSession.current = `${user.id}:location`;
          setMessage(""); setPrompt("location"); return;
        }
        if (await biometricReminderDue()) {
          const label = await biometricLabel().catch(() => "Use biometrics");
          if (cancelled) return;
          shownThisSession.current = `${user.id}:biometric`;
          setBiometricText(label); setMessage(""); setPrompt("biometric");
        }
      })();
    }, 1800);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [loading, locationState, pathname, prompt, pushState, user?.id]);

  async function handleNotificationEnable() {
    if (notificationActionInFlight.current) return;
    notificationActionInFlight.current = true;
    try {
      setSaving(true); setMessage("");
      if (pushState?.requiresSettings) { openedSettings.current = "notifications"; await openPhoneNotificationSettings(); return; }
      const state = await enablePhoneNotifications();
      setPushState(state);
      if (state.enabled) setPrompt(null); else setMessage(state.message || "Notifications are still off. You can enable them later in device settings.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not enable phone notifications."); }
    finally { notificationActionInFlight.current = false; setSaving(false); }
  }

  async function handleLocationEnable() {
    try {
      setSaving(true); setMessage("");
      if (locationState?.requiresSettings) { openedSettings.current = "location"; await openLocationSettings(); return; }
      const state = await requestForegroundLocationPermission();
      setLocationState(state);
      if (state.enabled) { await clearLocationReminderSnooze(); setPrompt(null); }
      else setMessage("Location is still off. You can search manually, and LetsGoRide will explain again when a feature needs your position.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not enable location access."); }
    finally { setSaving(false); }
  }

  async function handleBiometricEnable() {
    try { setSaving(true); setMessage(""); await enableBiometricLogin(); setPrompt(null); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not enable biometric login."); }
    finally { setSaving(false); }
  }

  async function dismissPrompt() {
    if (prompt === "notifications") await snoozeNotificationReminder(7);
    if (prompt === "location") await snoozeLocationReminder(7);
    if (prompt === "biometric") await snoozeBiometricReminder(30);
    setPrompt(null); setMessage("");
  }

  if (Platform.OS === "web") return null;
  const worker = user?.role === "driver" || user?.role === "courier";
  const needsSettings = prompt === "notifications" ? Boolean(pushState?.requiresSettings) : prompt === "location" ? Boolean(locationState?.requiresSettings) : false;
  const notificationRetry = prompt === "notifications" && Boolean(pushState?.permissionGranted) && !needsSettings;
  const title = prompt === "notifications" ? "Don’t miss an important update" : prompt === "location" ? worker ? "Location keeps work accurate" : "Use your location when it helps" : "Faster secure login";
  const body = prompt === "notifications"
    ? notificationRetry
      ? "Notification permission is already on. LetsGoRide needs to finish registering this device so ride, delivery, message and safety alerts can reach this phone."
      : "Allow notifications for driver acceptance and arrival, Food updates, Courier progress, messages, verification and safety alerts."
    : prompt === "location"
      ? worker
        ? "LetsGoRide uses your location for nearby work, accurate pickup and live journey tracking while you are working. We explain separately before asking for any stronger background permission."
        : "LetsGoRide uses location for accurate pickup points, nearby drivers, delivery locations, ETAs and trip safety. You can still enter places manually when location is off."
      : `${biometricText} can unlock LetsGoRide without typing your password each time.`;
  const primaryTitle = prompt === "notifications"
    ? needsSettings ? "Open notification settings" : notificationRetry ? "Retry notifications" : "Allow notifications"
    : prompt === "location"
      ? needsSettings ? "Open location settings" : "Allow location"
      : biometricText;
  const savingTitle = prompt === "notifications"
    ? needsSettings ? "Opening…" : notificationRetry ? "Retrying…" : "Setting up…"
    : "Opening…";
  const action = prompt === "notifications" ? handleNotificationEnable : prompt === "location" ? handleLocationEnable : handleBiometricEnable;

  return (
    <Modal visible={Boolean(prompt)} transparent animationType="fade" onRequestClose={() => void dismissPrompt()}>
      <View style={styles.backdrop}><View style={styles.card}>
        <Text style={styles.eyebrow}>BEFORE WE ASK YOUR PHONE</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <View style={styles.actions}>
          <AppButton title={saving ? savingTitle : primaryTitle} disabled={saving} onPress={action} />
          <AppButton title="Not now" variant="secondary" disabled={saving} onPress={() => void dismissPrompt()} />
        </View>
        <Text style={styles.helper}>Not now is respected. If the operating system will not show the permission prompt again, LetsGoRide sends you to Settings instead.</Text>
      </View></View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "rgba(17,17,17,0.34)" },
  card: { gap: 14, borderRadius: 28, borderWidth: StyleSheet.hairlineWidth, borderColor: v2Theme.colors.lineStrong, backgroundColor: v2Theme.colors.surface, padding: 21 },
  eyebrow: { color: v2Theme.colors.inkTertiary, fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  title: { color: v2Theme.colors.ink, fontSize: 25, lineHeight: 30, fontWeight: "900", letterSpacing: -0.5 },
  body: { color: v2Theme.colors.inkSecondary, fontSize: 13, lineHeight: 20 },
  message: { color: v2Theme.colors.ink, fontSize: 11, lineHeight: 17, fontWeight: "700", backgroundColor: v2Theme.colors.surfaceMuted, borderRadius: 14, padding: 10 },
  actions: { gap: 8 }, helper: { color: v2Theme.colors.inkTertiary, fontSize: 9, lineHeight: 14 },
});
