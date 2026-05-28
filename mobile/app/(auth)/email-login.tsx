import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { BrandLogo } from "../../components/layout/BrandLogo";
import { AppButton } from "../../components/ui/AppButton";
import { AppInput } from "../../components/ui/AppInput";
import { Screen } from "../../components/ui/Screen";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { emailLogin, resendEmailVerification } from "../../services/authService";
import { biometricLabel, hasBiometricLoginCredential, loginWithBiometrics } from "../../services/biometricService";
import {
  enablePhoneNotifications,
  hasSeenNotificationExplanation,
  markNotificationExplanationSeen,
} from "../../services/pushNotificationService";
import { normalizeEmail } from "../../utils/passwordRules";

export default function EmailLoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email || "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [biometricReady, setBiometricReady] = useState(false);
  const [biometricText, setBiometricText] = useState("Use biometrics");
  const [notificationIntroOpen, setNotificationIntroOpen] = useState(false);
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [pendingRole, setPendingRole] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadBiometrics() {
      setBiometricReady(await hasBiometricLoginCredential());
      setBiometricText(await biometricLabel());
    }
    loadBiometrics().catch(() => setBiometricReady(false));
  }, []);

  function routeForRole(role?: string | null) {
    if (role === "admin") router.replace("/(admin)/dashboard" as never);
    else if (role === "driver") router.replace("/(driver)/home" as never);
    else router.replace("/(passenger)/home" as never);
  }

  async function continueAfterAuth(role?: string | null) {
    try {
      if (!(await hasSeenNotificationExplanation())) {
        setPendingRole(role || null);
        setNotificationIntroOpen(true);
        return;
      }
    } catch {
      // If local storage fails, continue login instead of blocking access.
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
      // The user is logged in; notification setup can be retried from Settings.
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
      const result = await emailLogin(normalizeEmail(email), password);
      await continueAfterAuth(result.user.role);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect to LetsGoRide. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function biometricLogin() {
    try {
      setLoading(true);
      setError("");
      const user = await loginWithBiometrics();
      await continueAfterAuth(user.role);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Please log in with your password again.");
    } finally {
      setLoading(false);
    }
  }

  async function resendCode() {
    try {
      setResending(true);
      setError("");
      setMessage("");
      await resendEmailVerification(normalizeEmail(email));
      setMessage("Verification code sent. Check your email.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification code could not be sent. Please try again.");
    } finally {
      setResending(false);
    }
  }

  const normalizedEmail = normalizeEmail(email);
  const needsVerification = error.toLowerCase().includes("verify your email");

  return (
    <Screen title="Login" showBack fallbackRoute="/(auth)/welcome" showNotifications={false}>
      <Modal visible={notificationIntroOpen} transparent animationType="fade" onRequestClose={() => finishNotificationIntro(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Enable notifications?</Text>
            <Text style={styles.body}>
              LetsGoRide sends phone alerts for booking requests, trip updates, messages, verification reviews, support replies, and safety notices.
            </Text>
            <View style={styles.modalActions}>
              <AppButton title="Enable notifications" loading={notificationSaving} onPress={() => finishNotificationIntro(true)} />
              <AppButton title="Not now" variant="secondary" onPress={() => finishNotificationIntro(false)} />
            </View>
          </View>
        </View>
      </Modal>
      <View style={styles.logoWrap}>
        <BrandLogo size="regular" />
      </View>
      <View style={styles.card}>
        <Text style={styles.title}>Login with email</Text>
        <Text style={styles.body}>Access your passenger or driver account. You can add a phone number later.</Text>
        <AppInput
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          leftIcon="email-outline"
          placeholder="Enter your email"
        />
        <View style={styles.passwordBlock}>
          <AppInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            leftIcon="lock-outline"
            rightIcon={showPassword ? "eye-off-outline" : "eye-outline"}
            onPressRightIcon={() => setShowPassword((current) => !current)}
            placeholder="Enter your password"
          />
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.push({ pathname: "/(auth)/forgot-password", params: { email: normalizedEmail } } as never)}>
            <Text style={styles.forgot}>Forgot password?</Text>
          </Pressable>
        </View>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {needsVerification ? (
          <View style={styles.inlineActions}>
            <AppButton title="Resend verification code" variant="secondary" loading={resending} onPress={resendCode} disabled={!normalizedEmail} />
            <AppButton
              title="Go to email verification"
              variant="ghost"
              onPress={() => router.push({ pathname: "/(auth)/email-verification", params: { email: normalizedEmail } } as never)}
            />
          </View>
        ) : null}
        <AppButton title="Login" loading={loading} onPress={submit} disabled={!normalizedEmail || password.length < 8} />
        {biometricReady ? <AppButton title={biometricText} variant="secondary" onPress={biometricLogin} loading={loading} /> : null}
        <AppButton title="Create account" variant="secondary" onPress={() => router.push("/(auth)/email-register" as never)} />
      </View>
      <Text style={styles.footer}>Proudly Zimbabwean · Built for safer shared rides</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  logoWrap: {
    alignItems: "center",
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.md,
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  title: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 30,
  },
  body: {
    color: colors.mutedText,
    lineHeight: 22,
  },
  passwordBlock: {
    gap: spacing.xs,
  },
  forgot: {
    alignSelf: "flex-end",
    color: colors.primaryGreen,
    fontWeight: "900",
    fontSize: 13,
  },
  message: {
    color: colors.primaryGreen,
    fontWeight: "800",
  },
  error: {
    color: colors.danger,
    fontWeight: "700",
  },
  inlineActions: {
    gap: spacing.sm,
  },
  footer: {
    color: colors.mutedText,
    textAlign: "center",
    fontWeight: "800",
    fontSize: 12,
    paddingBottom: spacing.md,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.xl,
    backgroundColor: "rgba(17,20,23,0.26)",
  },
  modalCard: {
    gap: spacing.md,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.xl,
  },
  modalTitle: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 24,
  },
  modalActions: {
    gap: spacing.sm,
  },
});
