import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppButton } from "../../components/ui/AppButton";
import { AppInput } from "../../components/ui/AppInput";
import { Screen } from "../../components/ui/Screen";
import { ErrorState } from "../../components/states/ErrorState";
import { colors } from "../../constants/colors";
import { MOCK_OTP } from "../../constants/config";
import { spacing } from "../../constants/spacing";
import { useAuth } from "../../hooks/useAuth";
import { isValidPhone } from "../../utils/validation";

export default function LoginScreen() {
  const router = useRouter();
  const { requestOtp, loading, error } = useAuth();
  const [phone, setPhone] = useState("+263");
  const [localError, setLocalError] = useState("");

  async function handleContinue() {
    if (!isValidPhone(phone)) {
      setLocalError("Enter a valid Zimbabwe or international phone number.");
      return;
    }
    setLocalError("");
    await requestOtp(phone);
    router.push({ pathname: "/(auth)/otp", params: { phone } } as never);
  }

  return (
    <Screen title="Login" showHeader>
      <View style={styles.copy}>
        <Text style={styles.title}>Enter your phone number</Text>
        <Text style={styles.body}>
          LetsGo Ride uses phone sign-in for the MVP. In local development, use
          mock OTP {MOCK_OTP}.
        </Text>
      </View>
      <AppInput
        label="Phone number"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        placeholder="+263 77 000 0000"
      />
      {localError ? <Text style={styles.error}>{localError}</Text> : null}
      {error ? <ErrorState message={error} /> : null}
      <AppButton title="Send OTP" loading={loading} onPress={handleContinue} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  copy: {
    gap: spacing.md,
  },
  title: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 30,
  },
  body: {
    color: colors.mutedText,
    lineHeight: 23,
  },
  error: {
    color: colors.danger,
    fontWeight: "700",
  },
});
