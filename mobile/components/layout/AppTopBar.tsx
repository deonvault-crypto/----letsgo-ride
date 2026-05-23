import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Href, useRouter } from "expo-router";

import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { BrandLogo } from "./BrandLogo";

type AppTopBarProps = {
  title?: string;
  showBack?: boolean;
  fallbackRoute?: Href;
  showNotifications?: boolean;
};

export function AppTopBar({
  title,
  showBack = false,
  fallbackRoute,
  showNotifications = true,
}: AppTopBarProps) {
  const router = useRouter();

  function goBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace((fallbackRoute || "/(auth)/welcome") as never);
  }

  return (
    <View style={styles.header}>
      <View style={styles.left}>
        {showBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={goBack}
            style={styles.backButton}
          >
            <MaterialCommunityIcons name="chevron-left" size={28} color={colors.whiteText} />
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        ) : (
          <BrandLogo size="small" />
        )}
      </View>
      {title && showBack ? <Text numberOfLines={1} style={styles.title}>{title}</Text> : null}
      {showNotifications ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          onPress={() => router.push("/(shared)/notifications" as never)}
          style={styles.iconButton}
        >
          <MaterialCommunityIcons name="bell-outline" size={21} color={colors.whiteText} />
        </Pressable>
      ) : (
        <View style={styles.iconSpacer} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  left: {
    minWidth: 92,
    alignItems: "flex-start",
  },
  backButton: {
    minWidth: 86,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    borderRadius: 22,
    paddingRight: spacing.sm,
  },
  backText: {
    color: colors.whiteText,
    fontWeight: "800",
    fontSize: 14,
  },
  title: {
    flex: 1,
    color: colors.whiteText,
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconSpacer: {
    width: 42,
    height: 42,
  },
});
