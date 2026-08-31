import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect, useRef } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";

import { PermissionReminder } from "../components/permissions/PermissionReminder";
import { PendingReviewReminder } from "../components/reviews/PendingReviewReminder";
import { FoodBasketProvider } from "../contexts/FoodBasketContext";
import { LocationDraftProvider } from "../contexts/LocationDraftContext";
import { NotificationProvider } from "../contexts/NotificationContext";
import { RealtimeProvider } from "../contexts/RealtimeContext";
import { SessionProvider, useSession } from "../contexts/SessionContext";
import { getActiveHailingTrip, getHailingDriverStatus } from "../services/hailingService";
import { resolveNotificationRoute } from "../services/notificationRouting";
import { getActiveCourierDelivery } from "../services/operationsService";
import { configureNotificationHandler } from "../services/pushNotificationService";

// Define native background tasks from the app entry tree. Importing these modules
// registers TaskManager tasks but does not start location tracking.
import "../services/hailingBackgroundLocation";
import "../services/courierBackgroundLocation";

function NotificationResponseRouter() {
  const router = useRouter();
  const { user } = useSession();

  useEffect(() => { configureNotificationHandler(); }, []);
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

function ActiveJobRecoveryRouter() {
  const router = useRouter();
  const { user, loading, isGuest } = useSession();
  const attemptedFor = useRef<string | null>(null);

  useEffect(() => {
    if (loading || isGuest || !user?.id) return;
    if (!["customer", "driver", "courier"].includes(String(user.role))) return;
    const recoveryKey = `${user.id}:${user.role}`;
    if (attemptedFor.current === recoveryKey) return;
    attemptedFor.current = recoveryKey;
    let settled = false;

    void (async () => {
      try {
        if (user.role === "driver") {
          const status = await getHailingDriverStatus();
          if (settled) return;
          if (status.active_trip?.id) {
            router.replace(`/(driver)/hailing/trip/${status.active_trip.id}` as never);
          } else if (status.offer?.id) {
            router.replace("/(driver)/hailing" as never);
          }
          return;
        }
        if (user.role === "courier") {
          const active = await getActiveCourierDelivery();
          if (!settled && active?.id) router.replace(`/(courier)/delivery/${active.id}` as never);
          return;
        }
        const active = await getActiveHailingTrip();
        if (settled || !active?.id) return;
        if (active.status === "SEARCHING") router.replace("/(customer)/hail" as never);
        else router.replace(`/(customer)/hail/trip/${active.id}` as never);
      } catch {
        // A transient startup network failure must not block normal app launch.
        if (!settled && attemptedFor.current === recoveryKey) attemptedFor.current = null;
      }
    })();

    return () => { settled = true; };
  }, [isGuest, loading, router, user?.id, user?.role]);
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
            <ActiveJobRecoveryRouter />
            <PermissionReminder />
            <LocationDraftProvider>
              <FoodBasketProvider>
                <StatusBar style="dark" />
                <Stack screenOptions={{ headerShown: false, animation: "fade", animationDuration: 220, animationTypeForReplace: "push" }}>
                  <Stack.Screen name="index" options={{ gestureEnabled: false, animation: "fade" }} />
                  <Stack.Screen name="(auth)" options={{ gestureEnabled: false, animation: "fade" }} />
                  <Stack.Screen name="(customer)" options={{ gestureEnabled: false, animation: "fade" }} />
                  <Stack.Screen name="(driver)" options={{ gestureEnabled: false, animation: "fade" }} />
                  <Stack.Screen name="(courier)" options={{ gestureEnabled: false, animation: "fade" }} />
                  <Stack.Screen name="(merchant)" options={{ gestureEnabled: false, animation: "fade" }} />
                  <Stack.Screen name="(admin)" options={{ gestureEnabled: false, animation: "fade" }} />
                  <Stack.Screen name="(shared)/location-picker" options={{ gestureEnabled: false, animation: "none" }} />
                </Stack>
                <PendingReviewReminder />
              </FoodBasketProvider>
            </LocationDraftProvider>
          </NotificationProvider>
        </RealtimeProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
