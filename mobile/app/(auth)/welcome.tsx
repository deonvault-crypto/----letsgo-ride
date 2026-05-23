import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { BrandLogo } from "../../components/layout/BrandLogo";
import { AppButton } from "../../components/ui/AppButton";
import { Screen } from "../../components/ui/Screen";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <Screen showHeader={false} scroll={false}>
      <View style={styles.hero}>
        <View style={styles.logoWrap}>
          <BrandLogo size="large" />
        </View>
        <View style={styles.previewCard}>
          <View style={styles.routeLine}>
            <View style={styles.dot} />
            <View style={styles.line} />
            <View style={styles.dot} />
          </View>
          <View style={styles.routeCopy}>
            <Text style={styles.previewTitle}>Harare to Bulawayo</Text>
            <Text style={styles.previewText}>3 seats available - clear pickup notes</Text>
          </View>
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>Find trusted rides across Zimbabwe.</Text>
          <Text style={styles.body}>
            Book intercity seats, local rides, and errands with verified drivers,
            clear pricing, and safer trip records.
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        <AppButton
          title="Continue as Passenger"
          onPress={() => router.replace("/(passenger)/home" as never)}
        />
        <AppButton
          title="Continue as Driver"
          variant="secondary"
          onPress={() => router.replace("/(driver)/home" as never)}
        />
        <AppButton
          title="Login"
          variant="ghost"
          onPress={() => router.push("/(auth)/email-login" as never)}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    flex: 1,
    justifyContent: "center",
    gap: spacing.xxl,
  },
  logoWrap: {
    alignSelf: "flex-start",
  },
  previewCard: {
    minHeight: 170,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.lg,
    shadowColor: colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
  routeLine: {
    flexDirection: "row",
    alignItems: "center",
    width: "76%",
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.primaryGreen,
  },
  line: {
    flex: 1,
    height: 2,
    backgroundColor: colors.border,
  },
  routeCopy: {
    alignItems: "center",
    gap: spacing.xs,
  },
  previewTitle: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 18,
  },
  previewText: {
    color: colors.mutedText,
    fontWeight: "700",
    textAlign: "center",
  },
  copy: {
    gap: spacing.md,
  },
  title: {
    color: colors.whiteText,
    fontSize: 38,
    lineHeight: 42,
    fontWeight: "900",
  },
  body: {
    color: colors.mutedText,
    fontSize: 16,
    lineHeight: 24,
  },
  actions: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
});
