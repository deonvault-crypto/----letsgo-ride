import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppButton } from "../../components/ui/AppButton";
import { AppInput } from "../../components/ui/AppInput";
import { Screen } from "../../components/ui/Screen";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { forgotPassword } from "../../services/authService";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    try {
      setLoading(true);
      setError("");
      await forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to request reset code.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen title="Forgot password" showBack fallbackRoute="/(auth)/email-login" showNotifications={false}>
      <View style={styles.copy}>
        <Text style={styles.title}>Reset access</Text>
        <Text style={styles.body}>Enter your email and we will send instructions if the account exists.</Text>
      </View>
      <AppInput label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {sent ? <StatusBadge label="Reset requested" tone="success" /> : null}
      <AppButton title="Send reset code" loading={loading} onPress={submit} disabled={!email} />
      <AppButton title="Enter reset code" variant="ghost" onPress={() => router.push({ pathname: "/(auth)/reset-password", params: { email } } as never)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  copy: { gap: spacing.md },
  title: { color: colors.whiteText, fontWeight: "900", fontSize: 30 },
  body: { color: colors.mutedText, lineHeight: 22 },
  error: { color: colors.danger, fontWeight: "700" },
});
