export type AppNotification = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  read: boolean;
  created_at: string;
  delivered_push?: boolean;
  push_status?: string;
};

export type NotificationPreferences = {
  trip_updates: boolean;
  booking_requests: boolean;
  support_replies: boolean;
  safety_alerts: boolean;
  marketing_messages: boolean;
};

