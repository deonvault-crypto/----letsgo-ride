import { Stack, useRouter } from "expo-router";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";

import { FoodBasketProvider } from "../contexts/FoodBasketContext";
import { LocationDraftProvider } from "../contexts/LocationDraftContext";
import { configureNotificationHandler } from "../services/pushNotificationService";

const ALLOWED_NOTIFICATION_ROUTES = [
  "/(customer)/",
  "/(driver)/",
  "/(courier)/",
  "/(merchant)/",
  "/(admin)/",
  "/(shared)/",
] as const;

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    configureNotificationHandler();
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data || {};
      if (typeof data.target_route === "string" && ALLOWED_NOTIFICATION_ROUTES.some((prefix) => data.target_route.startsWith(prefix))) {
        router.push(data.target_route as never);
        return;
      }
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
        router.push(`/(customer)/ride/${data.ride_id}` as never);
        return;
      }
      const foodOrderId = typeof data.food_order_id === "string" ? data.food_order_id : typeof data.order_id === "string" ? data.order_id : null;
      if (foodOrderId) {
        router.push(`/(shared)/food/order/${foodOrderId}` as never);
        return;
      }
      if (typeof data.delivery_id === "string") {
        router.push(`/(customer)/courier/${data.delivery_id}` as never);
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
      <LocationDraftProvider>
        <FoodBasketProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              animation: "fade",
              animationDuration: 220,
              animationTypeForReplace: "push",
            }}
          >
            <Stack.Screen name="index" options={{ gestureEnabled: false, animation: "fade" }} />
            <Stack.Screen name="(auth)" options={{ gestureEnabled: false, animation: "fade" }} />
            <Stack.Screen name="(customer)" options={{ gestureEnabled: false, animation: "fade" }} />
            <Stack.Screen name="(driver)" options={{ gestureEnabled: false, animation: "fade" }} />
            <Stack.Screen name="(courier)" options={{ gestureEnabled: false, animation: "fade" }} />
            <Stack.Screen name="(merchant)" options={{ gestureEnabled: false, animation: "fade" }} />
            <Stack.Screen name="(admin)" options={{ gestureEnabled: false, animation: "fade" }} />
          </Stack>
        </FoodBasketProvider>
      </LocationDraftProvider>
    </SafeAreaProvider>
  );
}
