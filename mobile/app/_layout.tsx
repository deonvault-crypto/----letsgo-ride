import { Stack } from "expo-router";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";

import { configureNotificationHandler } from "../services/pushNotificationService";

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    configureNotificationHandler();
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data || {};
      if (typeof data.conversation_id === "string") {
        router.push(`/(shared)/conversation/${data.conversation_id}` as never);
        return;
      }
      if (typeof data.verification_status === "string") {
        router.push("/(shared)/verification" as never);
        return;
      }
      if (typeof data.driver_id === "string") {
        router.push(`/(admin)/verification/${data.driver_id}` as never);
        return;
      }
      if (typeof data.ride_id === "string") {
        router.push(`/(passenger)/ride/${data.ride_id}` as never);
        return;
      }
      if (typeof data.support_message_id === "string") {
        router.push("/(shared)/support" as never);
        return;
      }
      if (typeof data.report_id === "string") {
        router.push("/(shared)/safety" as never);
      }
    });
    return () => subscription.remove();
  }, [router]);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, animation: "none", animationTypeForReplace: "pop" }} />
    </SafeAreaProvider>
  );
}
