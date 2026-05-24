import { useState } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { BrandLogo } from "../../components/layout/BrandLogo";
import { AppButton } from "../../components/ui/AppButton";
import { AppInput } from "../../components/ui/AppInput";
import { PasswordRules } from "../../components/ui/PasswordRules";
import { Screen } from "../../components/ui/Screen";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { resetPassword } from "../../services/authService";
import { isStrongPassword, normalizeEmail } from "../../utils/passwordRules";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email || "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const normalizedEmail = normalizeEmail(email);
  const ready = Boolean(normalizedEmail && code.length === 6 && isStrongPassword(password) && password === confirmPassword);

  async function submit() {
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    try {
      setLoading(true);
      setError("");
      await resetPassword(normalizedEmail, code.trim(), password, confirmPassword);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reset password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen title="Reset password" showBack fallbackRoute="/(auth)/forgot-password" showNotifications={false}>
      <View style={styles.logoWrap}>
        <BrandLogo size="regular" />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>Set a new password</Text>
        <Text style={styles.body}>Use the reset code sent to your email.</Text>
      </View>
      <AppInput label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} leftIcon="email-outline" />
      <AppInput label="Reset code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} leftIcon="numeric" />
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
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <AppButton title="Reset password" loading={loading} onPress={submit} disabled={!ready} />
      <Modal visible={success} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <BrandLogo size="regular" />
            <Text style={styles.modalTitle}>Password reset successful</Text>
            <Text style={styles.modalBody}>Your password has been reset. You can now log in using your new password.</Text>
            <AppButton title="Back to login" onPress={() => router.replace({ pathname: "/(auth)/email-login", params: { email: normalizedEmail } } as never)} />
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
  modalTitle: { color: colors.whiteText, fontSize: 25, fontWeight: "900", textAlign: "center" },
  modalBody: { color: colors.mutedText, textAlign: "center", lineHeight: 22 },
});
