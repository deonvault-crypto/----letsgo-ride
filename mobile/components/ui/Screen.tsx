import { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Href, useLocalSearchParams, useSegments } from "expo-router";

import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import {
  groupHomeRoute,
  isProductGroup,
  isProductRootRoute,
  productAccountRoute,
  productHomeRoute,
  productRoleFromParam,
} from "../../navigation/roleRoutes";
import type { ProductNavRole } from "../../navigation/roleRoutes";
import { AppTopBar } from "../layout/AppTopBar";
import { BottomNav } from "../layout/BottomNav";

const useSafeSegments: typeof useSegments = typeof useSegments === "function" ? useSegments : (() => [] as never);
const useSafeLocalSearchParams: typeof useLocalSearchParams = typeof useLocalSearchParams === "function" ? useLocalSearchParams : (() => ({} as never));

type ScreenProps = {
  children: ReactNode;
  title?: string;
  navRole?: ProductNavRole;
  showHeader?: boolean;
  showBack?: boolean;
  fallbackRoute?: Href;
  showNotifications?: boolean;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
};

export function Screen({
  children,
  title,
  navRole,
  showHeader = true,
  showBack,
  fallbackRoute,
  showNotifications = true,
  scroll = true,
  refreshing = false,
  onRefresh,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const segments = useSafeSegments() as string[];
  const params = useSafeLocalSearchParams<{ product?: string }>();
  const group = segments[0];
  const routeName = segments[segments.length - 1] || "";
  const isProductRoute = isProductGroup(group);
  const inferredBack = isProductRoute && !isProductRootRoute(group, routeName);
  const resolvedShowBack = showBack ?? inferredBack;
  const contextualRole = productRoleFromParam(params.product);
  const fallbackText = String(fallbackRoute || "");
  const genericSharedFallback = fallbackText.includes("/(shared)/account") || fallbackText.includes("/(shared)/profile");
  const resolvedFallback = contextualRole && (genericSharedFallback || !fallbackRoute)
    ? productAccountRoute(contextualRole)
    : fallbackRoute || productHomeRoute(navRole) || groupHomeRoute(group);
  const contentPadding = navRole
    ? spacing.bottomNavHeight + Math.max(insets.bottom, spacing.md) + spacing.xxl
    : spacing.xxl;
  const body = scroll ? (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: contentPadding }]}
      scrollIndicatorInsets={{ bottom: contentPadding }}
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryGreen} /> : undefined}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.staticContent, { paddingBottom: contentPadding }]}>{children}</View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <LinearGradient
        colors={[colors.appBackground, "#F7F2E8", "#EFE8DC"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboard}
      >
        <View style={styles.frame}>
          {showHeader ? (
            <AppTopBar
              title={title}
              showBack={resolvedShowBack}
              fallbackRoute={resolvedFallback}
              showNotifications={showNotifications}
            />
          ) : null}
          {body}
        </View>
        {navRole ? <BottomNav role={navRole} activeTone={routeName === "account" ? "neutral" : "brand"} /> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.appBackground },
  keyboard: { flex: 1 },
  frame: { flex: 1, paddingHorizontal: spacing.screen },
  scrollContent: { paddingTop: spacing.md, gap: spacing.lg },
  staticContent: { flex: 1, paddingTop: spacing.md, gap: spacing.lg },
});
