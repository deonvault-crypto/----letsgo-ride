import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { BrandLogo } from "../../components/layout/BrandLogo";
import { AppButton } from "../../components/ui/AppButton";
import { Screen } from "../../components/ui/Screen";
import { colors } from "../../constants/colors";
import { legalUrls } from "../../constants/legal";
import { spacing } from "../../constants/spacing";
import { openExternalUrl } from "../../utils/openExternalUrl";

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
        <View style={styles.legalLinks}>
          <LegalLink label="Privacy Policy" url={legalUrls.privacy} />
          <Text style={styles.separator}>|</Text>
          <LegalLink label="Terms of Use" url={legalUrls.terms} />
          <Text style={styles.separator}>|</Text>
          <LegalLink label="Support" url={legalUrls.support} />
        </View>
      </View>
    </Screen>
  );
}

function LegalLink({ label, url }: { label: string; url: string }) {
  return (
    <Pressable onPress={() => openExternalUrl(url)} hitSlop={8}>
      {({ pressed }) => (
        <Text style={[styles.legalText, pressed && styles.legalTextPressed]}>{label}</Text>
      )}
    </Pressable>
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
  legalLinks: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  legalText: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: "800",
  },
  legalTextPressed: {
    color: colors.primaryGreen,
  },
  separator: {
    color: colors.border,
    fontWeight: "700",
  },
});
