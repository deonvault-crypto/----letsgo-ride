import { usePathname } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AppState, Modal, Platform, StyleSheet, Text, View } from "react-native";

import { AppButton } from "../ui/AppButton";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { useSession } from "../../contexts/SessionContext";
import {
  biometricLabel,
  biometricReminderDue,
  enableBiometricLogin,
  snoozeBiometricReminder,
} from "../../services/biometricService";
import {
  enablePhoneNotifications,
  notificationReminderDue,
  openPhoneNotificationSettings,
  phoneNotificationStatus,
  PushRegistrationState,
  snoozeNotificationReminder,
} from "../../services/pushNotificationService";

type PromptKind = "notifications" | "biometric" | null;

function isSafePromptPath(pathname: string) {
  return pathname.endsWith("/home")
    || pathname.endsWith("/account")
    || pathname.endsWith("/dashboard");
}

export function PermissionReminder() {
  const pathname = usePathname();
  const { user, loading } = useSession();
  const isBootstrapPath = pathname === "/";
  const [pushState, setPushState] = useState<PushRegistrationState | null>(null);
  const [prompt, setPrompt] = useState<PromptKind>(null);
  const [message, setMessage] = useState("");
  const [biometricText, setBiometricText] = useState("Use biometrics");
  const [saving, setSaving] = useState(false);
  const shownThisSession = useRef<string | null>(null);
  const openedSettings = useRef(false);
  const userIdRef = useRef<string | null>(null);

  userIdRef.current = user?.id || null;

  useEffect(() => {
    if (Platform.OS === "web") return undefined;
    let active = true;

    if (loading || !user?.id || isBootstrapPath) {
      setPushState(null);
      setPrompt(null);
      setMessage("");
      shownThisSession.current = null;
      return undefined;
    }

    if (shownThisSession.current && !shownThisSession.current.startsWith(`${user.id}:`)) {
      shownThisSession.current = null;
    }

    phoneNotificationStatus()
      .then((state) => {
        if (active) setPushState(state);
      })
      .catch(() => {
        if (active) {
          setPushState({
            enabled: false,
            status: "off",
            canAskAgain: true,
            requiresSettings: false,
            message: "Phone notifications could not be checked. You can try again.",
          });
        }
      });

    return () => {
      active = false;
    };
  }, [isBootstrapPath, loading, user?.id]);

  useEffect(() => {
    if (Platform.OS === "web") return undefined;
    let appActive = AppState.currentState === "active";
    const subscription = AppState.addEventListener("change", (nextState) => {
      const resumed = !appActive && nextState === "active";
      appActive = nextState === "active";
      if (!resumed || !openedSettings.current || !userIdRef.current) return;
      openedSettings.current = false;
      void phoneNotificationStatus()
        .then((state) => {
          setPushState(state);
          if (state.enabled) {
            setMessage("");
            setPrompt(null);
          }
        })
        .catch(() => undefined);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS === "web" || loading || !user?.id || !pushState || prompt || shownThisSession.current || !isSafePromptPath(pathname)) {
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        if (cancelled || !user?.id) return;

        if (!pushState.enabled && await notificationReminderDue()) {
          shownThisSession.current = `${user.id}:notifications`;
          setMessage(pushState.message || "Turn on notifications so you do not miss service updates and messages.");
          setPrompt("notifications");
          return;
        }

        if (await biometricReminderDue()) {
          const label = await biometricLabel().catch(() => "Use biometrics");
          if (cancelled) return;
          shownThisSession.current = `${user.id}:biometric`;
          setBiometricText(label);
          setMessage("");
          setPrompt("biometric");
        }
      })();
    }, 2500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [loading, pathname, prompt, pushState, user?.id]);

  async function handleNotificationEnable() {
    try {
      setSaving(true);
      setMessage("");
      if (pushState?.requiresSettings) {
        openedSettings.current = true;
        await openPhoneNotificationSettings();
        return;
      }

      const state = await enablePhoneNotifications();
      setPushState(state);
      if (state.enabled) {
        setPrompt(null);
        setMessage("");
      } else {
        setMessage(state.message || "Phone notifications are still off.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not enable phone notifications.");
    } finally {
      setSaving(false);
    }
  }

  async function handleBiometricEnable() {
    try {
      setSaving(true);
      setMessage("");
      await enableBiometricLogin();
      setPrompt(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not enable biometric login.");
    } finally {
      setSaving(false);
    }
  }

  async function dismissPrompt() {
    if (prompt === "notifications") await snoozeNotificationReminder(7);
    if (prompt === "biometric") await snoozeBiometricReminder(30);
    setPrompt(null);
    setMessage("");
  }

  if (Platform.OS === "web") return null;

  const notificationNeedsSettings = prompt === "notifications" && Boolean(pushState?.requiresSettings);
  const title = prompt === "notifications" ? "Stay updated" : "Faster secure login";
  const body = prompt === "notifications"
    ? "LetsGoRide can alert you about Ride, Food and Courier progress, messages, verification, support and safety updates."
    : `${biometricText} can unlock LetsGoRide without typing your password each time.`;
  const primaryTitle = prompt === "notifications"
    ? notificationNeedsSettings ? "Open device settings" : "Turn on notifications"
    : biometricText;

  return (
    <Modal visible={Boolean(prompt)} transparent animationType="fade" onRequestClose={() => void dismissPrompt()}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>RECOMMENDED</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.actions}>
            <AppButton
              title={primaryTitle}
              loading={saving}
              onPress={prompt === "notifications" ? handleNotificationEnable : handleBiometricEnable}
            />
            <AppButton title="Not now" variant="secondary" disabled={saving} onPress={() => void dismissPrompt()} />
          </View>
          <Text style={styles.helper}>If you choose Not now, LetsGoRide will remind you later instead of repeatedly showing the system permission prompt.</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.xl,
    backgroundColor: "rgba(17,20,23,0.30)",
  },
  card: {
    gap: spacing.md,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.xl,
  },
  eyebrow: {
    color: colors.primaryGreen,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  title: {
    color: colors.whiteText,
    fontSize: 25,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  body: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 21,
  },
  message: {
    color: colors.whiteText,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  actions: {
    gap: spacing.sm,
  },
  helper: {
    color: colors.mutedText,
    fontSize: 10,
    lineHeight: 15,
  },
});
