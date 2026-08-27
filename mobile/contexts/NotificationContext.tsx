import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { usePathname } from "expo-router";

import { listNotifications } from "../services/notificationService";
import { AppNotification } from "../types/notification.types";
import { useSession } from "./SessionContext";

type NotificationState = {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  refreshNotifications: () => Promise<void>;
  markReadLocally: (id: string) => void;
  markAllReadLocally: () => void;
};

const defaultNotifications: NotificationState = {
  notifications: [],
  unreadCount: 0,
  loading: false,
  error: null,
  refreshNotifications: async () => undefined,
  markReadLocally: () => undefined,
  markAllReadLocally: () => undefined,
};

const NotificationContext = createContext<NotificationState>(defaultNotifications);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, loading: sessionLoading } = useSession();
  const isBootstrapPath = pathname === "/";
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<{ userId: string; promise: Promise<void> } | null>(null);
  const userId = useRef<string | null>(null);
  const snapshotUserId = useRef<string | null>(null);

  userId.current = user?.id || null;

  const refreshNotifications = useCallback(() => {
    if (!userId.current) return Promise.resolve();
    const requestUserId = userId.current;
    if (inFlight.current?.userId === requestUserId) return inFlight.current.promise;
    let request!: Promise<void>;
    request = (async () => {
      try {
        setLoading(true);
        const next = await listNotifications();
        if (userId.current === requestUserId) {
          setNotifications(next);
          setError(null);
        }
      } catch (nextError) {
        if (userId.current === requestUserId) {
          setError(nextError instanceof Error ? nextError.message : "Unable to load notifications.");
        }
      } finally {
        if (userId.current === requestUserId) setLoading(false);
        if (inFlight.current?.promise === request) inFlight.current = null;
      }
    })();
    inFlight.current = { userId: requestUserId, promise: request };
    return request;
  }, []);

  const markReadLocally = useCallback((id: string) => {
    setNotifications((current) => current.map((item) => item.id === id ? { ...item, read: true } : item));
  }, []);

  const markAllReadLocally = useCallback(() => {
    setNotifications((current) => current.map((item) => item.read ? item : { ...item, read: true }));
  }, []);

  useEffect(() => {
    if (sessionLoading || isBootstrapPath) return;
    if (snapshotUserId.current !== (user?.id || null)) {
      snapshotUserId.current = user?.id || null;
      setNotifications([]);
      setError(null);
    }
    if (!user?.id) {
      setNotifications([]);
      setError(null);
      setLoading(false);
      return;
    }
    void refreshNotifications();
  }, [isBootstrapPath, sessionLoading, user?.id, refreshNotifications]);

  useEffect(() => {
    let appActive = AppState.currentState === "active";
    const subscription = AppState.addEventListener("change", (nextState) => {
      const resumed = !appActive && nextState === "active";
      appActive = nextState === "active";
      if (resumed && userId.current) void refreshNotifications();
    });
    return () => subscription.remove();
  }, [refreshNotifications]);

  const visibleNotifications = useMemo(
    () => notifications.filter((item) => item.user_id === user?.id),
    [notifications, user?.id],
  );
  const unreadCount = useMemo(() => visibleNotifications.reduce((count, item) => count + (item.read ? 0 : 1), 0), [visibleNotifications]);

  return (
    <NotificationContext.Provider value={{ notifications: visibleNotifications, unreadCount, loading, error, refreshNotifications, markReadLocally, markAllReadLocally }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
