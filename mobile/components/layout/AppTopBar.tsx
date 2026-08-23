import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Href, useRouter, useSegments } from "expo-router";
import { useEffect, useState } from "react";

import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { getToken } from "../../services/api";
import { listNotifications } from "../../services/notificationService";
import { BrandLogo } from "./BrandLogo";

const useSafeSegments: typeof useSegments = typeof useSegments === "function" ? useSegments : (() => [] as never);

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
  const segments = useSafeSegments() as string[];
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!showNotifications) return;
    let active = true;
    async function loadUnread() {
      try {
        const token = await getToken();
        if (!token) {
          if (active) setUnreadCount(0);
          return;
        }
        const notifications = await listNotifications();
        if (active) setUnreadCount(notifications.filter((notification) => !notification.read).length);
      } catch {
        if (active) setUnreadCount(0);
      }
    }
    loadUnread();
    const interval = setInterval(loadUnread, 30000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [showNotifications]);

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
          onPress={() => {
            const group = segments[0];
            const product = group === "(driver)" ? "driver" : group === "(courier)" ? "courier" : group === "(merchant)" ? "merchant" : undefined;
            router.push(product ? ({ pathname: "/(shared)/notifications", params: { product } } as never) : "/(shared)/notifications" as never);
          }}
          style={styles.iconButton}
        >
          <MaterialCommunityIcons name="bell-outline" size={21} color={colors.whiteText} />
          {unreadCount ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
            </View>
          ) : null}
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
  badge: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.danger,
    paddingHorizontal: 3,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 8,
    fontWeight: "900",
  },
  iconSpacer: {
    width: 42,
    height: 42,
  },
});
