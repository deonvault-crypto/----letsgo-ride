import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { BrandLogo } from "../../components/layout/BrandLogo";
import { AppButton } from "../../components/ui/AppButton";
import { AppInput } from "../../components/ui/AppInput";
import { LocationPicker } from "../../components/ui/LocationPicker";
import { PasswordRules } from "../../components/ui/PasswordRules";
import { Screen } from "../../components/ui/Screen";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { emailRegister, resendEmailVerification } from "../../services/authService";
import { isStrongPassword, normalizeEmail } from "../../utils/passwordRules";
import { intentCopy, parseApplicationIntent } from "../../utils/authIntent";

export default function EmailRegisterScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string; intent?: string }>();
  const intent = parseApplicationIntent(params.intent);
  const copy = intentCopy(intent);
  const fallbackRoute = intent === "customer_signup" ? "/(auth)/welcome" : "/(shared)/work-with-us";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const normalizedEmail = normalizeEmail(email);
  const valid = useMemo(
    () => Boolean(name.trim() && normalizedEmail && city.trim() && isStrongPassword(password) && password === confirmPassword),
    [name, normalizedEmail, city, password, confirmPassword],
  );
  const duplicateVerified = error.toLowerCase().includes("already has an account");
  const existingUnverified = error.toLowerCase().includes("waiting for email verification");

  async function submit() {
    try {
      setLoading(true);
      setError("");
      setInfo("");
      if (!isStrongPassword(password)) {
        setError("Password must include uppercase, lowercase, number, and symbol.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
      await emailRegister({
        name: name.trim(),
        email: normalizedEmail,
        city: city.trim(),
        password,
        confirm_password: confirmPassword,
      });
      router.replace({
        pathname: "/(auth)/email-verification",
        params: { email: normalizedEmail, returnTo: params.returnTo, intent },
      } as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create account.");
    } finally {
      setLoading(false);
    }
  }

  async function resendCode() {
    try {
      setResending(true);
      setInfo("");
      setError("");
      await resendEmailVerification(normalizedEmail);
      setInfo("Verification code sent. Check your email.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification code could not be sent. Please try again.");
    } finally {
      setResending(false);
    }
  }

  return (
    <Screen title={intent === "customer_signup" ? "Create account" : copy.title} showBack fallbackRoute={fallbackRoute} showNotifications={false}>
      <View style={styles.logoWrap}>
        <BrandLogo size="large" />
      </View>
      <View style={styles.card}>
        <Text style={styles.title}>{copy.registerTitle}</Text>
        <Text style={styles.body}>{intent === "customer_signup" ? "Ride across town, order food or send something with one secure login." : copy.authBody}</Text>
        <AppInput label="Full name" value={name} onChangeText={setName} leftIcon="account-outline" placeholder="Your full name" />
        <AppInput label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} leftIcon="email-outline" placeholder="you@example.com" />
        <LocationPicker label="City" value={city} onChangeText={setCity} placeholder="Select your city" />
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
        />
        <PasswordRules password={password} />
        <AppInput
          label="Confirm password"
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
        {info ? <Text style={styles.message}>{info}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {duplicateVerified ? (
          <View style={styles.inlineActions}>
            <AppButton
              title="Log in"
              variant="secondary"
              onPress={() => router.replace({ pathname: "/(auth)/email-login", params: { email: normalizedEmail, returnTo: params.returnTo, intent } } as never)}
            />
            <AppButton title="Reset password" variant="ghost" onPress={() => router.push({ pathname: "/(auth)/forgot-password", params: { email: normalizedEmail, returnTo: params.returnTo, intent } } as never)} />
          </View>
        ) : null}
        {existingUnverified ? (
          <View style={styles.inlineActions}>
            <AppButton title="Resend code" variant="secondary" loading={resending} onPress={resendCode} />
            <AppButton
              title="Verify email"
              variant="ghost"
              onPress={() => router.push({ pathname: "/(auth)/email-verification", params: { email: normalizedEmail, returnTo: params.returnTo, intent } } as never)}
            />
          </View>
        ) : null}
        <AppButton title={copy.registerButton} loading={loading} onPress={submit} disabled={!valid} />
      </View>
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
  },
  title: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 28,
    lineHeight: 32,
  },
  body: {
    color: colors.mutedText,
    lineHeight: 22,
  },
  error: {
    color: colors.danger,
    fontWeight: "700",
  },
  message: {
    color: colors.primaryGreen,
    fontWeight: "800",
  },
  inlineActions: {
    gap: spacing.sm,
  },
});
