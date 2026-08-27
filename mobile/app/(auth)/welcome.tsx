import { AccessibilityInfo, Animated, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";

import { BrandLogo } from "../../components/layout/BrandLogo";
import { AppButton } from "../../components/ui/AppButton";
import { Screen } from "../../components/ui/Screen";
import { colors } from "../../constants/colors";
import { legalUrls } from "../../constants/legal";
import { spacing } from "../../constants/spacing";
import { openExternalUrl } from "../../utils/openExternalUrl";

export default function WelcomeScreen() {
  const router = useRouter();
  const logoScale = useRef(new Animated.Value(0.94)).current;
  const logoTranslateY = useRef(new Animated.Value(14)).current;
  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroTranslateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduceMotion) => {
        if (!mounted) return;
        if (reduceMotion) {
          logoScale.setValue(1);
          logoTranslateY.setValue(0);
          heroOpacity.setValue(1);
          heroTranslateY.setValue(0);
          return;
        }
        Animated.sequence([
          Animated.spring(logoScale, {
            toValue: 1,
            friction: 5,
            tension: 78,
            useNativeDriver: true,
          }),
          Animated.parallel([
            Animated.timing(heroOpacity, {
              toValue: 1,
              duration: 360,
              useNativeDriver: true,
            }),
            Animated.timing(heroTranslateY, {
              toValue: 0,
              duration: 360,
              useNativeDriver: true,
            }),
          ]),
        ]).start();
        Animated.spring(logoTranslateY, {
          toValue: 0,
          friction: 6,
          tension: 70,
          useNativeDriver: true,
        }).start();
      })
      .catch(() => {
        logoScale.setValue(1);
        logoTranslateY.setValue(0);
        heroOpacity.setValue(1);
        heroTranslateY.setValue(0);
      });

    return () => {
      mounted = false;
    };
  }, [heroOpacity, heroTranslateY, logoScale, logoTranslateY]);

  return (
    <Screen showHeader={false} scroll={false}>
      <View style={styles.hero}>
        <Animated.View
          style={[
            styles.logoWrap,
            {
              transform: [{ translateY: logoTranslateY }, { scale: logoScale }],
            },
          ]}
        >
          <BrandLogo size="large" />
        </Animated.View>
        <Animated.View style={[styles.animatedHeroContent, { opacity: heroOpacity, transform: [{ translateY: heroTranslateY }] }]}>
          <View style={styles.imageCard}>
            <Image
              source={require("../../assets/images/ride-sharing-welcome.jpg")}
              style={styles.heroImage}
              resizeMode="cover"
              resizeMethod="resize"
            />
            <View style={styles.imageOverlay}>
              <Text style={styles.imageLabel}>Verified rides. Clear trips. Safer journeys.</Text>
            </View>
          </View>
          <View style={styles.copy}>
            <Text style={styles.title}>Find trusted rides across Zimbabwe.</Text>
            <Text style={styles.body}>
              Book intercity seats, local rides, and errands with verified drivers,
              clear pricing, and safer trip records.
            </Text>
          </View>
        </Animated.View>
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
    gap: spacing.xl,
  },
  logoWrap: {
    alignSelf: "flex-start",
  },
  animatedHeroContent: {
    gap: spacing.xl,
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  imageLabel: {
    color: colors.whiteText,
    fontWeight: "900",
    lineHeight: 19,
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
