import { useState } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { BrandLogo } from "../../components/layout/BrandLogo";
import { AppButton } from "../../components/ui/AppButton";
import { AppInput } from "../../components/ui/AppInput";
import { Screen } from "../../components/ui/Screen";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { resendEmailVerification, verifyEmail } from "../../services/authService";
import {
  enablePhoneNotifications,
  hasSeenNotificationExplanation,
  markNotificationExplanationSeen,
} from "../../services/pushNotificationService";
import { normalizeEmail } from "../../utils/passwordRules";

export default function EmailVerificationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; returnTo?: string }>();
  const [email, setEmail] = useState(params.email || "");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [verificationComplete, setVerificationComplete] = useState(false);
  const [verifiedRole, setVerifiedRole] = useState<string | null>(null);
  const [verifiedWithSession, setVerifiedWithSession] = useState(false);
  const [notificationIntroOpen, setNotificationIntroOpen] = useState(false);
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [pendingRole, setPendingRole] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function safeCustomerReturnTo() {
    const value = typeof params.returnTo === "string" ? params.returnTo : "";
    const allowed = ["/(shared)/courier", "/(shared)/food", "/(passenger)/"];
    return allowed.some((prefix) => value === prefix || value.startsWith(prefix)) ? value : null;
  }

  function routeForRole(role?: string | null) {
    if (role === "admin") {
      router.replace("/(admin)/dashboard" as never);
      return;
    }
    if (role === "driver") {
      router.replace("/(driver)/home" as never);
      return;
    }
    if (role === "courier") {
      router.replace("/(driver)/work" as never);
      return;
    }
    if (role === "merchant") {
      router.replace("/(merchant)/home" as never);
      return;
    }
    router.replace((safeCustomerReturnTo() || "/(passenger)/home") as never);
  }

  async function continueAfterVerification(role?: string | null) {
    try {
      if (!(await hasSeenNotificationExplanation())) {
        setPendingRole(role || null);
        setVerificationComplete(false);
        setNotificationIntroOpen(true);
        return;
      }
    } catch {
      // Continue account activation even if local notification state cannot be read.
    }
    routeForRole(role);
  }

  async function finishNotificationIntro(enableNotifications: boolean) {
    try {
      setNotificationSaving(true);
      await markNotificationExplanationSeen();
      if (enableNotifications) {
        await enablePhoneNotifications();
      }
    } catch {
      // Notification setup can be retried from Settings after the user enters the app.
    } finally {
      setNotificationSaving(false);
      setNotificationIntroOpen(false);
      routeForRole(pendingRole);
    }
  }

  async function submit() {
    try {
      setLoading(true);
      setError("");
      setMessage("");
      const result = await verifyEmail(normalizeEmail(email), code.trim());
      setVerificationComplete(true);
      setVerifiedRole(result.user?.role || null);
      setVerifiedWithSession(Boolean(result.token && result.user));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to verify email.");
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    try {
      setResending(true);
      setError("");
      setMessage("");
      await resendEmailVerification(normalizeEmail(email));
      setMessage("Verification code sent. Check your email.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to resend code.");
    } finally {
      setResending(false);
    }
  }

  return (
    <Screen title="Verify email" showBack fallbackRoute="/(auth)/email-login" showNotifications={false}>
      <View style={styles.logoWrap}>
        <BrandLogo size="regular" />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>Verify your email</Text>
        <Text style={styles.body}>We sent a 6-digit code to your email. Enter it to activate your LetsGoRide customer account.</Text>
      </View>
      <AppInput label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} leftIcon="email-outline" />
      <AppInput label="6-digit code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} leftIcon="numeric" />
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <AppButton title="Verify email" loading={loading} onPress={submit} disabled={!email || code.length !== 6} />
      <AppButton title="Resend code" variant="secondary" loading={resending} onPress={resend} disabled={!email} />
      <Modal visible={verificationComplete} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <BrandLogo size="regular" />
            <Text style={styles.modalTitle}>Account verified</Text>
            <Text style={styles.modalBody}>You’re ready. We’ll take you back to what you were doing.</Text>
            <AppButton
              title={verifiedWithSession ? "Continue" : "Continue to login"}
              onPress={() => {
                if (verifiedWithSession) continueAfterVerification(verifiedRole);
                else router.replace({ pathname: "/(auth)/email-login", params: { email: normalizeEmail(email), returnTo: params.returnTo } } as never);
              }}
            />
          </View>
        </View>
      </Modal>
      <Modal visible={notificationIntroOpen} transparent animationType="fade" onRequestClose={() => finishNotificationIntro(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Enable notifications?</Text>
            <Text style={styles.modalBody}>
              LetsGoRide sends phone alerts for booking requests, trip updates, messages, verification reviews, support replies, and safety notices.
            </Text>
            <View style={styles.modalActions}>
              <AppButton title="Enable notifications" loading={notificationSaving} onPress={() => finishNotificationIntro(true)} />
              <AppButton title="Not now" variant="secondary" onPress={() => finishNotificationIntro(false)} />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  logoWrap: { alignItems: "center" },
  copy: { gap: spacing.md },
  title: { color: colors.whiteText, fontWeight: "900", fontSize: 30 },
  body: { color: colors.mutedText, lineHeight: 22 },
  message: { color: colors.primaryGreen, fontWeight: "800" },
  error: { color: colors.danger, fontWeight: "700" },
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.xl,
    backgroundColor: "rgba(17,20,23,0.28)",
  },
  modalCard: {
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  modalTitle: {
    color: colors.whiteText,
    fontSize: 26,
    fontWeight: "900",
  },
  modalBody: {
    color: colors.mutedText,
    textAlign: "center",
    lineHeight: 22,
  },
  modalActions: {
    alignSelf: "stretch",
    gap: spacing.sm,
  },
});
