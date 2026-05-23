import { Image, StyleSheet, Text, View } from "react-native";
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
        <View style={styles.imageCard}>
          <Image
            source={require("../../assets/images/ride-sharing-welcome.jpg")}
            style={styles.heroImage}
            resizeMode="cover"
          />
          <View style={styles.imageOverlay}>
            <Text style={styles.imageLabel}>Travel together with clearer trip records.</Text>
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
          title="Login"
          onPress={() => router.push("/(auth)/email-login" as never)}
        />
        <AppButton
          title="Create account"
          variant="secondary"
          onPress={() => router.push("/(auth)/email-register" as never)}
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
  imageCard: {
    height: 210,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    shadowColor: colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
    overflow: "hidden",
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },
  imageOverlay: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    borderRadius: 18,
    backgroundColor: "rgba(250,247,240,0.88)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  imageLabel: {
    color: colors.whiteText,
    fontWeight: "900",
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
