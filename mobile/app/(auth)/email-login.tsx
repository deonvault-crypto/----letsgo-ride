import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppButton } from "../../components/ui/AppButton";
import { AppInput } from "../../components/ui/AppInput";
import { Screen } from "../../components/ui/Screen";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { emailLogin } from "../../services/authService";

export default function EmailLoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    try {
      setLoading(true);
      setError("");
      await emailLogin(email, password);
      router.replace("/(passenger)/home" as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen title="Email login">
      <View style={styles.copy}>
        <Text style={styles.title}>Login with email</Text>
        <Text style={styles.body}>
          Use email and password to access your passenger or driver account.
          You can add a phone number later before booking or posting rides.
        </Text>
      </View>
      <AppInput label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <AppInput label="Password" value={password} onChangeText={setPassword} secureTextEntry />
      {error ? <Text style={styles.error}>{error}</Text> : null}
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
  error: { color: colors.danger, fontWeight: "700" },
});
