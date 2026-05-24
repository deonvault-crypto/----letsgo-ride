import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AppButton } from "../../components/ui/AppButton";
import { AppInput } from "../../components/ui/AppInput";
import { Screen } from "../../components/ui/Screen";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { emailLogin, resendEmailVerification } from "../../services/authService";

export default function EmailLoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email || "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submit() {
    try {
      setLoading(true);
      setError("");
      setMessage("");
      const result = await emailLogin(email, password);
      if (result.user.role === "admin") {
        router.replace("/(admin)/dashboard" as never);
      } else if (result.user.role === "driver") {
        router.replace("/(driver)/home" as never);
      } else {
        router.replace("/(passenger)/home" as never);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  }

  async function resendCode() {
    try {
      setResending(true);
      setError("");
      setMessage("");
      await resendEmailVerification(email.trim());
      setMessage("Verification code sent. Check your email.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification code could not be sent. Please try again.");
    } finally {
      setResending(false);
    }
  }

  return (
    <Screen title="Login" showBack fallbackRoute="/(auth)/welcome" showNotifications={false}>
      <View style={styles.copy}>
        <Text style={styles.title}>Login with email</Text>
        <Text style={styles.body}>
          Use email and password to access your passenger or driver account.
          You can add a phone number later before booking or posting rides.
        </Text>
      </View>
      <AppInput label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <AppInput label="Password" value={password} onChangeText={setPassword} secureTextEntry />
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {error.includes("verify your email") ? (
        <View style={styles.inlineActions}>
          <AppButton
            title="Resend verification code"
            variant="secondary"
            loading={resending}
            onPress={resendCode}
            disabled={!email}
          />
          <AppButton
            title="Go to email verification"
            variant="ghost"
            onPress={() =>
              router.push({
                pathname: "/(auth)/email-verification",
                params: { email },
              } as never)
            }
          />
        </View>
      ) : null}
      <AppButton title="Login" loading={loading} onPress={submit} disabled={!email || password.length < 8} />
      <AppButton title="Create account" variant="ghost" onPress={() => router.push("/(auth)/email-register" as never)} />
      <AppButton title="Forgot password" variant="ghost" onPress={() => router.push("/(auth)/forgot-password" as never)} />
      <AppButton title="Use phone verification" variant="ghost" onPress={() => router.push("/(auth)/login" as never)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  copy: { gap: spacing.md },
  title: { color: colors.whiteText, fontWeight: "900", fontSize: 30 },
  body: { color: colors.mutedText, lineHeight: 22 },
  message: { color: colors.primaryGreen, fontWeight: "800" },
  error: { color: colors.danger, fontWeight: "700" },
  inlineActions: { gap: spacing.sm },
});
