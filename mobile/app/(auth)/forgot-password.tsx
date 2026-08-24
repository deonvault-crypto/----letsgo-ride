import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { BrandLogo } from "../../components/layout/BrandLogo";
import { AppButton } from "../../components/ui/AppButton";
import { AppInput } from "../../components/ui/AppInput";
import { PasswordRules } from "../../components/ui/PasswordRules";
import { Screen } from "../../components/ui/Screen";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { forgotPassword, resetPassword } from "../../services/authService";
import { isStrongPassword, normalizeEmail } from "../../utils/passwordRules";
import { parseApplicationIntent } from "../../utils/authIntent";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; returnTo?: string; intent?: string }>();
  const intent = parseApplicationIntent(params.intent);
  const [email, setEmail] = useState(params.email || "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [sent, setSent] = useState(false);
  const [success, setSuccess] = useState(false);
  const [sending, setSending] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const normalizedEmail = normalizeEmail(email);
  const resetReady = Boolean(sent && normalizedEmail && code.length === 6 && isStrongPassword(password) && password === confirmPassword);

  async function sendCode() {
    try {
      setSending(true);
      setError("");
      setMessage("");
      await forgotPassword(normalizedEmail);
      setSent(true);
      setMessage("If this account exists, we sent a reset code.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset code. Please try again.");
    } finally {
      setSending(false);
    }
  }

  async function submitReset() {
    if (!isStrongPassword(password)) {
      setError("Password must include uppercase, lowercase, number, and symbol.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    try {
      setResetting(true);
      setError("");
      await resetPassword(normalizedEmail, code.trim(), password, confirmPassword);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reset password.");
    } finally {
      setResetting(false);
    }
  }

  return (
    <Screen title="Reset password" showBack fallbackRoute={{ pathname: "/(auth)/email-login", params: { email: normalizedEmail, returnTo: params.returnTo, intent } } as never} showNotifications={false}>
      <View style={styles.logoWrap}>
        <BrandLogo size="regular" />
      </View>
      <View style={styles.card}>
        <Text style={styles.title}>Reset your password</Text>
        <Text style={styles.body}>Enter your email and we will send a reset code.</Text>
        <AppInput
          label="Email"
          value={email}
          onChangeText={(next) => {
            setEmail(next);
            setSent(false);
            setMessage("");
          }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          leftIcon="email-outline"
          placeholder="Enter your email"
        />
        <AppButton title={sent ? "Resend reset code" : "Send reset code"} loading={sending} onPress={sendCode} disabled={!normalizedEmail} />
        {sent ? (
          <View style={styles.resetForm}>
            <AppInput label="6-digit code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} leftIcon="numeric" />
            <AppInput
              label="New password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              leftIcon="lock-outline"
              rightIcon={showPassword ? "eye-off-outline" : "eye-outline"}
              onPressRightIcon={() => setShowPassword((current) => !current)}
            />
            <PasswordRules password={password} />
            <AppInput
              label="Confirm new password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
              autoCorrect={false}
              leftIcon="lock-check-outline"
              rightIcon={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
              onPressRightIcon={() => setShowConfirmPassword((current) => !current)}
            />
            {confirmPassword && password !== confirmPassword ? <Text style={styles.error}>Passwords do not match.</Text> : null}
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setSent(false)}>
              <Text style={styles.link}>Change email</Text>
            </Pressable>
            <AppButton title="Reset password" loading={resetting} onPress={submitReset} disabled={!resetReady} />
          </View>
        ) : null}
        {message ? <Text style={styles.message}>{message}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <Modal visible={success} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <BrandLogo size="regular" />
            <Text style={styles.modalTitle}>Password reset successful</Text>
            <Text style={styles.modalBody}>Your password has been reset. You can now log in using your new password.</Text>
            <AppButton
              title="Back to login"
              onPress={() => router.replace({ pathname: "/(auth)/email-login", params: { email: normalizedEmail, returnTo: params.returnTo, intent } } as never)}
            />
          </View>
        </View>
      </Modal>
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
    fontSize: 30,
    fontWeight: "900",
  },
  body: {
    color: colors.mutedText,
    lineHeight: 22,
  },
  resetForm: {
    gap: spacing.md,
  },
  link: {
    color: colors.primaryGreen,
    fontWeight: "900",
    textAlign: "right",
  },
  message: {
    color: colors.primaryGreen,
    fontWeight: "800",
  },
  error: {
    color: colors.danger,
    fontWeight: "700",
  },
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
    fontSize: 25,
    fontWeight: "900",
    textAlign: "center",
  },
  modalBody: {
    color: colors.mutedText,
    textAlign: "center",
    lineHeight: 22,
  },
});
