import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { BrandWordmark } from "../../components/layout/Header";
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
          <BrandWordmark />
        </View>
        <View style={styles.iconPanel}>
          <MaterialCommunityIcons name="road-variant" size={78} color={colors.primaryGreen} />
          <View style={styles.line} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>Share rides across Zimbabwe.</Text>
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
  iconPanel: {
    height: 190,
    borderRadius: 34,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(34,41,48,0.72)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  line: {
    position: "absolute",
    width: 260,
    height: 2,
    backgroundColor: "rgba(105,240,174,0.22)",
    transform: [{ rotate: "-18deg" }],
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
