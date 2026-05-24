import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AppButton } from "../../components/ui/AppButton";
import { AppInput } from "../../components/ui/AppInput";
import { Screen } from "../../components/ui/Screen";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { resendEmailVerification, verifyEmail } from "../../services/authService";

export default function EmailVerificationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email || "");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit() {
    try {
      setLoading(true);
      setError("");
      setMessage("");
      await verifyEmail(email.trim(), code.trim());
      setMessage("Email verified. You can now login.");
      router.replace({
        pathname: "/(auth)/email-login",
        params: { email },
      } as never);
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
      await resendEmailVerification(email.trim());
      setMessage("Verification code sent. Check your email.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to resend code.");
    } finally {
      setResending(false);
    }
  }

  return (
    <Screen title="Verify email" showBack fallbackRoute="/(auth)/email-login" showNotifications={false}>
      <View style={styles.copy}>
        <Text style={styles.title}>Verify your email</Text>
        <Text style={styles.body}>
          We sent a verification code to your email. Enter the code to activate
          your LetsGoRide account.
        </Text>
      </View>
      <AppInput label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <AppInput label="6-digit code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} />
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <AppButton title="Verify email" loading={loading} onPress={submit} disabled={!email || code.length !== 6} />
      <AppButton title="Resend code" variant="secondary" loading={resending} onPress={resend} disabled={!email} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  copy: { gap: spacing.md },
  title: { color: colors.whiteText, fontWeight: "900", fontSize: 30 },
  body: { color: colors.mutedText, lineHeight: 22 },
  message: { color: colors.primaryGreen, fontWeight: "800" },
  error: { color: colors.danger, fontWeight: "700" },
});
