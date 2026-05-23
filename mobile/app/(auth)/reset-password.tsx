import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AppButton } from "../../components/ui/AppButton";
import { AppInput } from "../../components/ui/AppInput";
import { Screen } from "../../components/ui/Screen";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { resetPassword } from "../../services/authService";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email || "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    try {
      setLoading(true);
      setError("");
      await resetPassword(email, code, password);
      router.replace("/(auth)/email-login" as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reset password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen title="Reset password">
      <View style={styles.copy}>
        <Text style={styles.title}>Set a new password</Text>
        <Text style={styles.body}>Use the reset code sent to your email.</Text>
      </View>
      <AppInput label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <AppInput label="Reset code" value={code} onChangeText={setCode} keyboardType="number-pad" />
      <AppInput label="New password" value={password} onChangeText={setPassword} secureTextEntry />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <AppButton title="Reset password" loading={loading} onPress={submit} disabled={!email || !code || password.length < 8} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  copy: { gap: spacing.md },
  title: { color: colors.whiteText, fontWeight: "900", fontSize: 30 },
  body: { color: colors.mutedText, lineHeight: 22 },
  error: { color: colors.danger, fontWeight: "700" },
});
