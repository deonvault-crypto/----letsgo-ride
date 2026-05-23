import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AppButton } from "../../components/ui/AppButton";
import { AppInput } from "../../components/ui/AppInput";
import { Screen } from "../../components/ui/Screen";
import { ErrorState } from "../../components/states/ErrorState";
import { colors } from "../../constants/colors";
import { MOCK_OTP } from "../../constants/config";
import { spacing } from "../../constants/spacing";
import { useAuth } from "../../hooks/useAuth";

export default function OtpScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ phone?: string }>();
  const phone = params.phone || "";
  const [otp, setOtp] = useState(MOCK_OTP);
  const { verifyOtp, loading, error } = useAuth();

  async function handleVerify() {
    await verifyOtp(phone, otp, "passenger");
    router.replace("/(passenger)/home" as never);
  }

  return (
    <Screen title="Verify">
      <View style={styles.copy}>
        <Text style={styles.title}>Verify your phone</Text>
        <Text style={styles.body}>
          Enter the local development OTP sent for {phone || "your phone number"}.
          Use {MOCK_OTP} while the real provider is not connected.
        </Text>
      </View>
      <AppInput
        label="OTP code"
        value={otp}
        onChangeText={setOtp}
        keyboardType="number-pad"
        placeholder="123456"
        maxLength={6}
      />
      {error ? <ErrorState message={error} /> : null}
      <AppButton title="Verify and continue" loading={loading} onPress={handleVerify} />
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
});
