import { Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useCallback, useState } from "react";

import { EmptyState } from "../../components/states/EmptyState";
import { ErrorState } from "../../components/states/ErrorState";
import { LoadingState } from "../../components/states/LoadingState";
import { AppButton } from "../../components/ui/AppButton";
import { Screen } from "../../components/ui/Screen";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useNotifications } from "../../contexts/NotificationContext";
import { markAllNotificationsRead, markNotificationRead } from "../../services/notificationService";
import { resolveNotificationRoute } from "../../services/notificationRouting";
import { AppNotification } from "../../types/notification.types";

export default function NotificationsScreen() {
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);
  const [readingAll, setReadingAll] = useState(false);
  const { user } = useCurrentUser();
  const { notifications, unreadCount, loading, error, refreshNotifications, markReadLocally, markAllReadLocally } = useNotifications();

  const navRole: "customer" | "driver" | undefined = user?.role === "driver"
    ? "driver"
    : user?.role === "courier" || user?.role === "merchant" || user?.role === "admin"
      ? undefined
      : "customer";

  useFocusEffect(useCallback(() => {
    void refreshNotifications();
  }, [refreshNotifications]));

  async function openNotification(notification: AppNotification) {
    setActionError(null);
    try {
      if (!notification.read) {
        await markNotificationRead(notification.id);
        markReadLocally(notification.id);
      }
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : "Could not mark notification read."); }
    const route = resolveNotificationRoute({ data: notification.data, notificationType: notification.type, role: user?.role });
    if (route) router.push(route as never);
  }

  async function readAll() {
    if (readingAll) return;
    setReadingAll(true); setActionError(null);
    try { await markAllNotificationsRead(); markAllReadLocally(); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : "Could not mark notifications read."); }
    finally { setReadingAll(false); }
  }

  return (
    <Screen title="Notifications" showBack fallbackRoute="/(shared)/account" navRole={navRole}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{notifications.length ? (unreadCount ? `${unreadCount} unread` : "No unread updates") : "Inbox"}</Text>

      </View>
      {notifications.length ? <AppButton title="Mark all read" variant="secondary" loading={readingAll} onPress={readAll} /> : null}
      {actionError ? <Text accessibilityRole="alert" style={styles.body}>{actionError}</Text> : null}
      {loading && !notifications.length ? <LoadingState label="Loading notifications..." /> : null}
      {error ? <ErrorState message={error} onRetry={refreshNotifications} /> : null}
      {!loading && !error && notifications.length === 0 ? (
        <EmptyState title="No notifications yet" body="Ride, Food, Courier, support, and safety updates will appear here." icon="bell-outline" />
      ) : null}
      {notifications.map((notification) => (
        <Pressable
          key={notification.id}
          accessibilityRole="button"
          accessibilityLabel={`${notification.read ? "" : "Unread. "}${notification.title}. ${notification.body}`}
          onPress={() => openNotification(notification)}
          style={({ pressed }) => [styles.card, !notification.read && styles.unread, pressed && styles.pressed]}
        >
          <View style={styles.notificationRow}>
            <View style={styles.iconWrap}>
              <MaterialCommunityIcons name={iconForNotification(notification.type)} size={20} color={colors.primaryGreen} />
            </View>
            <View style={styles.notificationCopy}>
              <View style={styles.notificationHeader}>
                <Text style={styles.cardTitle}>{notification.title}</Text>
                {!notification.read ? <View style={styles.unreadDot} /> : null}
              </View>
              <Text style={styles.body}>{notification.body}</Text>
              <Text style={styles.time}>{formatTime(notification.created_at)}</Text>
            </View>
          </View>
        </Pressable>
      ))}
    </Screen>
  );
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function iconForNotification(type: string): keyof typeof MaterialCommunityIcons.glyphMap {
  if (type.includes("courier") || type.includes("delivery")) return "motorbike";
  if (type.includes("food") || type.includes("order")) return "food-fork-drink";
  if (type.includes("message")) return "message-text-outline";
  if (type.includes("booking") || type.includes("request")) return "ticket-confirmation-outline";
  if (type.includes("verification")) return "shield-check-outline";
  if (type.includes("support")) return "lifebuoy";
  if (type.includes("safety")) return "shield-alert-outline";
  return "bell-outline";
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  title: { color: colors.whiteText, fontWeight: "600", fontSize: 15 },
  card: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingVertical: spacing.lg, gap: spacing.xs },
  notificationRow: { flexDirection: "row", gap: spacing.md },
  iconWrap: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  notificationCopy: { flex: 1, gap: 4 },
  notificationHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primaryGreen },
  unread: {},
  pressed: { opacity: 0.7 },
  cardTitle: { flex: 1, color: colors.whiteText, fontWeight: "900", fontSize: 16 },
  body: { color: colors.mutedText, lineHeight: 22 },
  time: { color: colors.mutedText, fontSize: 12, fontWeight: "700" },
});

