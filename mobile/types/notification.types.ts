export type AppNotification = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  read: boolean;
  created_at: string;
  expires_at?: string;
  expired?: boolean;
  delivered_push?: boolean;
  push_status?: string;
};

export type NotificationPreferences = {
  trip_updates: boolean;
  booking_requests: boolean;
  messages: boolean;
  verification_updates: boolean;
  support_replies: boolean;
  safety_alerts: boolean;
  marketing_messages: boolean;
};

export type PushTokenRegistration = {
  expo_push_token: string;
  platform: string;
  device_name?: string;
  app_version?: string;
  active?: boolean;
};

