import { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Href } from "expo-router";

import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { BottomNav } from "../layout/BottomNav";
import { Header } from "../layout/Header";

type ScreenProps = {
  children: ReactNode;
  title?: string;
  navRole?: "passenger" | "driver";
  showHeader?: boolean;
  showBack?: boolean;
  fallbackRoute?: Href;
  showNotifications?: boolean;
  scroll?: boolean;
};

export function Screen({
  children,
  title,
  navRole,
  showHeader = true,
  showBack = false,
  fallbackRoute,
  showNotifications = true,
  scroll = true,
}: ScreenProps) {
  const contentPadding = navRole ? spacing.bottomNavHeight + 36 : spacing.xl;
  const body = scroll ? (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: contentPadding }]}
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
            <Header
              title={title}
              showBack={showBack}
              fallbackRoute={fallbackRoute}
              showNotifications={showNotifications}
            />
          ) : null}
          {body}
        </View>
        {navRole ? <BottomNav role={navRole} /> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.appBackground,
  },
  keyboard: {
    flex: 1,
  },
  frame: {
    flex: 1,
    paddingHorizontal: spacing.screen,
  },
  scrollContent: {
    paddingTop: spacing.md,
    gap: spacing.lg,
  },
  staticContent: {
    flex: 1,
    paddingTop: spacing.md,
    gap: spacing.lg,
  },
});
