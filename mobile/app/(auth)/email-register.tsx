import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppButton } from "../../components/ui/AppButton";
import { AppInput } from "../../components/ui/AppInput";
import { Screen } from "../../components/ui/Screen";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { emailRegister } from "../../services/authService";

export default function EmailRegisterScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("Harare");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    try {
      setLoading(true);
      setError("");
      await emailRegister({ name, email, city, password });
      router.replace("/(passenger)/home" as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create account.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen title="Register">
      <View style={styles.copy}>
        <Text style={styles.title}>Create passenger account</Text>
        <Text style={styles.body}>Register for ride requests, support, and trip records.</Text>
      </View>
      <AppInput label="Full name" value={name} onChangeText={setName} />
      <AppInput label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <AppInput label="City" value={city} onChangeText={setCity} />
      <AppInput label="Password" value={password} onChangeText={setPassword} secureTextEntry />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <AppButton title="Create account" loading={loading} onPress={submit} disabled={!name || !email || password.length < 8} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  copy: { gap: spacing.md },
  title: { color: colors.whiteText, fontWeight: "900", fontSize: 30 },
  body: { color: colors.mutedText, lineHeight: 22 },
  error: { color: colors.danger, fontWeight: "700" },
});
