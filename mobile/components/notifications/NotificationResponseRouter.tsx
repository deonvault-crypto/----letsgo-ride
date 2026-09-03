import { useEffect, useRef } from "react";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { useSession } from "../../contexts/SessionContext";
import { resolveNotificationRoute } from "../../services/notificationRouting";
import { configureNotificationHandler } from "../../services/pushNotificationService";

export function NotificationResponseRouter() {
  const router = useRouter();
  const { user, loading } = useSession();
  const handled = useRef<string | null>(null);
  useEffect(() => { configureNotificationHandler(); }, []);
  useEffect(() => {
    let active = true;
    const receive = (response: Notifications.NotificationResponse | null) => {
      if (!active || loading || !user || !response) return;
      const id = response.notification.request.identifier;
      if (handled.current === id) return;
      const data = response.notification.request.content.data || {};
      if (data.recipient_user_id && data.recipient_user_id !== user.id) return;
      const route = resolveNotificationRoute({ data, role: user.role });
      if (!route) return;
      handled.current = id;
      router.push(route as never);
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(receive);
    void Notifications.getLastNotificationResponseAsync().then(receive).catch(() => undefined);
    return () => { active = false; subscription.remove(); };
  }, [router, loading, user?.id, user?.role]);
  return null;
}
