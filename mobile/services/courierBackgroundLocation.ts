import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";

import { ApiRequestError } from "./api";
import { updateCourierLocation } from "./courierService";

export const COURIER_BACKGROUND_TASK = "letsgoride-courier-background-location";
const ACTIVE_DELIVERY_KEY = "letsgoride.courier.background-delivery-id";
const ACTIVE_STATUSES = new Set(["ASSIGNED", "COURIER_TO_PICKUP", "PICKED_UP", "IN_TRANSIT", "ARRIVING"]);

export type CourierBackgroundLocationPermissionState = {
  enabled: boolean;
  canAskAgain: boolean;
  requiresSettings: boolean;
};

function locationPayload(location: Location.LocationObject) {
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    heading: typeof location.coords.heading === "number" && location.coords.heading >= 0 ? location.coords.heading : null,
    speed: typeof location.coords.speed === "number" && location.coords.speed >= 0 ? location.coords.speed : null,
    accuracy: typeof location.coords.accuracy === "number" && location.coords.accuracy >= 0 ? location.coords.accuracy : null,
    recorded_at: new Date(location.timestamp).toISOString(),
  };
}

async function stopTaskAndClearDelivery() {
  await SecureStore.deleteItemAsync(ACTIVE_DELIVERY_KEY).catch(() => undefined);
  const running = await Location.hasStartedLocationUpdatesAsync(COURIER_BACKGROUND_TASK).catch(() => false);
  if (running) await Location.stopLocationUpdatesAsync(COURIER_BACKGROUND_TASK).catch(() => undefined);
}

if (Platform.OS !== "web" && !TaskManager.isTaskDefined(COURIER_BACKGROUND_TASK)) {
  TaskManager.defineTask(COURIER_BACKGROUND_TASK, async ({ data, error }) => {
    if (error) return;
    const deliveryId = await SecureStore.getItemAsync(ACTIVE_DELIVERY_KEY).catch(() => null);
    if (!deliveryId) {
      await stopTaskAndClearDelivery();
      return;
    }
    const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations || [];
    const latest = locations[locations.length - 1];
    if (!latest) return;
    try {
      const delivery = await updateCourierLocation(deliveryId, locationPayload(latest));
      if (!ACTIVE_STATUSES.has(delivery.status)) await stopTaskAndClearDelivery();
    } catch (err) {
      if (err instanceof ApiRequestError && [400, 401, 403, 404].includes(err.status || 0)) {
        await stopTaskAndClearDelivery();
      }
      // Temporary network/provider failures keep the task registered for recovery.
    }
  });
}

function permissionState(response: Location.PermissionResponse): CourierBackgroundLocationPermissionState {
  return {
    enabled: response.granted,
    canAskAgain: response.canAskAgain,
    requiresSettings: !response.granted && !response.canAskAgain,
  };
}

export async function getCourierBackgroundLocationPermissionState() {
  if (Platform.OS === "web") return { enabled: false, canAskAgain: false, requiresSettings: false };
  return permissionState(await Location.getBackgroundPermissionsAsync());
}

export async function requestCourierBackgroundLocationPermission() {
  const foreground = await Location.getForegroundPermissionsAsync();
  if (!foreground.granted) {
    const requested = await Location.requestForegroundPermissionsAsync();
    if (!requested.granted) {
      return { enabled: false, canAskAgain: requested.canAskAgain, requiresSettings: !requested.canAskAgain };
    }
  }
  return permissionState(await Location.requestBackgroundPermissionsAsync());
}

export async function startCourierBackgroundDeliveryTracking(deliveryId: string) {
  if (Platform.OS === "web") return false;
  const permission = await getCourierBackgroundLocationPermissionState();
  if (!permission.enabled) return false;
  await SecureStore.setItemAsync(ACTIVE_DELIVERY_KEY, deliveryId);
  const running = await Location.hasStartedLocationUpdatesAsync(COURIER_BACKGROUND_TASK).catch(() => false);
  if (running) return true;
  await Location.startLocationUpdatesAsync(COURIER_BACKGROUND_TASK, {
    accuracy: Location.Accuracy.High,
    distanceInterval: 25,
    timeInterval: 10000,
    deferredUpdatesDistance: 40,
    deferredUpdatesInterval: 15000,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.AutomotiveNavigation,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "LetsGoRide active delivery",
      notificationBody: "Sharing your location for the active delivery.",
      notificationColor: "#111111",
      killServiceOnDestroy: false,
    },
  });
  return true;
}

export async function stopCourierBackgroundDeliveryTracking() {
  if (Platform.OS === "web") return;
  await stopTaskAndClearDelivery();
}
