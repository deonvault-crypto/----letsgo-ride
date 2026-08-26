import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";

import { PermissionReminder } from "../components/permissions/PermissionReminder";
import { FoodBasketProvider } from "../contexts/FoodBasketContext";
import { LocationDraftProvider } from "../contexts/LocationDraftContext";
import { NotificationProvider } from "../contexts/NotificationContext";
import { RealtimeProvider } from "../contexts/RealtimeContext";
import { SessionProvider, useSession } from "../contexts/SessionContext";
import { resolveNotificationRoute } from "../services/notificationRouting";
import { configureNotificationHandler } from "../services/pushNotificationService";

function NotificationResponseRouter() {
  const router = useRouter();
  const { user } = useSession();

  useEffect(() => {
    configureNotificationHandler();
  }, []);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data || {};
      const route = resolveNotificationRoute({ data, role: user?.role });
      if (route) router.push(route as never);
    });
    return () => subscription.remove();
  }, [router, user?.role]);

  return null;
}

function SessionShellRouter() {
  const router = useRouter();
  const segments = useSegments();
  const { user, loading, isGuest } = useSession();

  useEffect(() => {
    const routeGroup = segments[0];
    if (loading || !routeGroup || routeGroup === "(auth)") return;
    const roleHome = user?.role === "admin" ? "/(admin)/dashboard"
      : user?.role === "driver" ? "/(driver)/home"
        : user?.role === "courier" ? "/(courier)/home"
          : user?.role === "merchant" ? "/(merchant)/home"
            : "/(customer)/home";
    const roleGroups = ["(customer)", "(driver)", "(courier)", "(merchant)", "(admin)"];
    if (!roleGroups.includes(String(routeGroup))) return;
    const expectedGroup = roleHome.slice(1, roleHome.indexOf(")") + 1);
    if ((isGuest || user) && routeGroup !== expectedGroup) router.replace(roleHome as never);
  }, [isGuest, loading, router, segments, user]);

  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <RealtimeProvider>
          <NotificationProvider>
            <NotificationResponseRouter />
            <SessionShellRouter />
            <PermissionReminder />
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
          </NotificationProvider>
        </RealtimeProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
