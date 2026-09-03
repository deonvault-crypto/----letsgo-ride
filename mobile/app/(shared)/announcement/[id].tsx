import { useCallback, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Screen } from "../../../components/ui/Screen";
import { AppButton } from "../../../components/ui/AppButton";
import { ErrorState } from "../../../components/states/ErrorState";
import { LoadingState } from "../../../components/states/LoadingState";
import { colors } from "../../../constants/colors";
import { useCurrentUser } from "../../../hooks/useCurrentUser";
import { useNotifications } from "../../../contexts/NotificationContext";
import { getNotification, markNotificationRead } from "../../../services/notificationService";
import { announcementAction, announcementExpired } from "../../../services/announcementService";
import { AppNotification } from "../../../types/notification.types";

export default function AnnouncementScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useCurrentUser();
  const { notifications, markReadLocally } = useNotifications();
  const [item, setItem] = useState<AppNotification | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setItem(null);
    if (!user?.id || typeof id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
      setLoading(false);
      setError("This announcement is unavailable.");
      return () => { active = false; };
    }
    void (async () => {
      try {
        const next = await getNotification(id);
        if (!active || next.user_id !== user.id) return;
        setItem(next);
        if (!next.read) {
          await markNotificationRead(id);
          if (active) markReadLocally(id);
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load announcement.");
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [id, user?.id, revision, markReadLocally]));
  const visible = item?.user_id === user?.id ? item : notifications.find(row => row.id === id && row.user_id === user?.id);
  const expired = visible ? announcementExpired(visible) : false;
  const action = visible && !expired ? announcementAction(visible.data?.action, user?.role) : null;
  return <Screen title="Announcement" showBack fallbackRoute="/(shared)/notifications">
    {loading && !visible ? <LoadingState label="Loading announcement…" /> : null}
    {error ? <ErrorState message={error} onRetry={() => setRevision(value => value + 1)} /> : null}
    {visible ? <>
      <Text accessibilityRole="header" style={styles.title}>{visible.title}</Text>
      <Text style={styles.time}>{new Date(visible.created_at).toLocaleString()}</Text>
      <Text selectable style={styles.body}>{visible.body}</Text>
      {expired ? <Text style={styles.time}>This announcement has expired.</Text> : null}
      {action ? <AppButton title={action.title} onPress={() => {
        if (!announcementExpired(visible)) router.push(action.route as never);
        else setRevision(value => value + 1);
      }} /> : null}
    </> : null}
  </Screen>;
}
const styles = StyleSheet.create({
  title: { color: colors.whiteText, fontSize: 22, fontWeight: "700" },
  time: { color: colors.mutedText, fontSize: 13, lineHeight: 20 },
  body: { color: colors.whiteText, fontSize: 16, lineHeight: 25, marginVertical: 8 },
});
