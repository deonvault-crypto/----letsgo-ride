import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

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
    if (notification.type === "driver_verification" || typeof data.verification_status === "string") {
      router.push("/(shared)/verification" as never);
      return;
    }
    if (typeof data.delivery_id === "string") {
      router.push(`/(shared)/courier/${data.delivery_id}` as never);
      return;
    }
    if (typeof data.food_order_id === "string") {
      router.push(`/(shared)/food/order/${data.food_order_id}` as never);
      return;
    }
    if (typeof data.support_message_id === "string") {
      router.push("/(shared)/support" as never);
      return;
    }
    if (typeof data.report_id === "string") {
      router.push("/(shared)/safety" as never);
      return;
    }
    if (typeof data.ride_id === "string") {
      router.push(`/(customer)/ride/${data.ride_id}` as never);
    }
  }

  async function readAll() {
    await markAllNotificationsRead();
    await load();
  }

  const unreadCount = notifications.filter((notification) => !notification.read).length;

  return (
    <Screen title="Notifications" showBack fallbackRoute="/(shared)/account" navRole="customer">
      <View style={styles.headerRow}>
        <Text style={styles.title}>Notifications</Text>
        {unreadCount ? <StatusBadge label={`${unreadCount} unread`} tone="warning" /> : null}
      </View>
      {notifications.length ? <AppButton title="Mark all read" variant="secondary" onPress={readAll} /> : null}
      {loading ? <LoadingState label="Loading notifications..." /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && !error && notifications.length === 0 ? (
        <EmptyState
          title="No notifications yet"
          body="Ride, Food, Courier, support, and safety updates will appear here."
          icon="bell-outline"
        />
      ) : null}
      {!loading && !error && notifications.map((notification) => (
        <Pressable
          key={notification.id}
          accessibilityRole="button"
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
  notificationRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(17,139,68,0.1)",
  },
  notificationCopy: {
    flex: 1,
    gap: 4,
  },
  notificationHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primaryGreen,
  },
  unread: {
    borderColor: colors.primaryGreen,
    backgroundColor: colors.elevated,
  },
  pressed: {
    transform: [{ scale: 0.99 }],
  },
  cardTitle: {
    flex: 1,
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
