import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppButton } from "../../components/ui/AppButton";
import { AppInput } from "../../components/ui/AppInput";
import { Screen } from "../../components/ui/Screen";
import { ErrorState } from "../../components/states/ErrorState";
import { colors } from "../../constants/colors";
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
      setLocalError("Enter your phone number with country code, for example +263772554186.");
      return;
    }
    setLocalError("");
    await requestOtp(phone);
    router.push({ pathname: "/(auth)/otp", params: { phone } } as never);
  }

  return (
    <Screen title="Phone verification" showBack fallbackRoute="/(auth)/welcome" showNotifications={false}>
      <View style={styles.copy}>
        <Text style={styles.title}>Enter your phone number</Text>
        <Text style={styles.body}>
          Phone verification is available when you want to add a reachable
          number for bookings, pickup coordination, and driver activity.
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
      <AppButton
        title="Use email instead"
        variant="ghost"
        onPress={() => router.push("/(auth)/email-login" as never)}
      />
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
