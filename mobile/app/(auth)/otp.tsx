import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AppButton } from "../../components/ui/AppButton";
import { AppInput } from "../../components/ui/AppInput";
import { Screen } from "../../components/ui/Screen";
import { ErrorState } from "../../components/states/ErrorState";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { useAuth } from "../../hooks/useAuth";

export default function OtpScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ phone?: string }>();
  const phone = params.phone || "";
  const [otp, setOtp] = useState("");
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
          Enter the verification code sent to your phone.
        </Text>
      </View>
      <AppInput
        label="OTP code"
        value={otp}
        onChangeText={setOtp}
        keyboardType="number-pad"
        placeholder="Verification code"
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
