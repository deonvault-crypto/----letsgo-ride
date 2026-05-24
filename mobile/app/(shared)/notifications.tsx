import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { EmptyState } from "../../components/states/EmptyState";
import { ErrorState } from "../../components/states/ErrorState";
import { LoadingState } from "../../components/states/LoadingState";
import { AppButton } from "../../components/ui/AppButton";
import { Screen } from "../../components/ui/Screen";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { useLiveRefresh } from "../../hooks/useLiveRefresh";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "../../services/notificationService";
import { AppNotification } from "../../types/notification.types";

export default function NotificationsScreen() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      setNotifications(await listNotifications());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useLiveRefresh(load, 10000);

  async function openNotification(notification: AppNotification) {
    await markNotificationRead(notification.id);
    await load();
    const data = notification.data || {};
    if (typeof data.conversation_id === "string") {
      router.push(`/(shared)/conversation/${data.conversation_id}` as never);
      return;
    }
    if (typeof data.ride_id === "string") {
      router.push(`/(passenger)/ride/${data.ride_id}` as never);
    }
  }

  async function readAll() {
    await markAllNotificationsRead();
    await load();
  }

  const unreadCount = notifications.filter((notification) => !notification.read).length;

  return (
    <Screen title="Notifications" showBack fallbackRoute="/(shared)/profile" navRole="passenger">
      <View style={styles.headerRow}>
        <Text style={styles.title}>Notifications</Text>
        {unreadCount ? <StatusBadge label={`${unreadCount} unread`} tone="warning" /> : null}
      </View>
      {notifications.length ? <AppButton title="Mark all read" variant="secondary" onPress={readAll} /> : null}
      {loading ? <LoadingState label="Loading notifications..." /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && !error && notifications.length === 0 ? (
        <EmptyState title="No notifications yet" body="Trip updates, support replies, and safety updates will appear here." />
      ) : null}
      {!loading && !error && notifications.map((notification) => (
        <Pressable
          key={notification.id}
          accessibilityRole="button"
          onPress={() => openNotification(notification)}
          style={({ pressed }) => [styles.card, !notification.read && styles.unread, pressed && styles.pressed]}
        >
          <Text style={styles.cardTitle}>{notification.title}</Text>
          <Text style={styles.body}>{notification.body}</Text>
          <Text style={styles.time}>{formatTime(notification.created_at)}</Text>
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

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  title: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 30,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  unread: {
    borderColor: colors.primaryGreen,
    backgroundColor: colors.elevated,
  },
  pressed: {
    transform: [{ scale: 0.99 }],
  },
  cardTitle: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 16,
  },
  body: {
    color: colors.mutedText,
    lineHeight: 22,
  },
  time: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: "700",
  },
});
