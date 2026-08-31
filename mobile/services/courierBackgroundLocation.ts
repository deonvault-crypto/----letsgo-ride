import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";

import { ApiRequestError } from "./api";
import { updateCourierLocation } from "./courierService";
import { updateCourierPresence } from "./courierPresenceService";

export const COURIER_BACKGROUND_TASK = "letsgoride-courier-background-location";
const ACTIVE_DELIVERY_KEY = "letsgoride.courier.background-delivery-id";
const ONLINE_AVAILABILITY_KEY = "letsgoride.courier.background-online";
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

async function taskRunning() {
  return Location.hasStartedLocationUpdatesAsync(COURIER_BACKGROUND_TASK).catch(() => false);
}

async function stopTask() {
  if (await taskRunning()) await Location.stopLocationUpdatesAsync(COURIER_BACKGROUND_TASK).catch(() => undefined);
}

async function onlineAvailabilityEnabled() {
  return (await SecureStore.getItemAsync(ONLINE_AVAILABILITY_KEY).catch(() => null)) === "true";
}

async function clearAllState() {
  await Promise.all([
    SecureStore.deleteItemAsync(ACTIVE_DELIVERY_KEY).catch(() => undefined),
    SecureStore.deleteItemAsync(ONLINE_AVAILABILITY_KEY).catch(() => undefined),
  ]);
  await stopTask();
}

async function startTask(mode: "availability" | "delivery") {
  await stopTask();
  await Location.startLocationUpdatesAsync(COURIER_BACKGROUND_TASK, mode === "delivery" ? {
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
  } : {
    accuracy: Location.Accuracy.Balanced,
    distanceInterval: 75,
    timeInterval: 30000,
    deferredUpdatesDistance: 100,
    deferredUpdatesInterval: 30000,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.AutomotiveNavigation,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "LetsGoRide Courier online",
      notificationBody: "Listening for nearby delivery requests. Location is used only while you stay Online.",
      notificationColor: "#111111",
      killServiceOnDestroy: false,
    },
  });
}

if (Platform.OS !== "web" && !TaskManager.isTaskDefined(COURIER_BACKGROUND_TASK)) {
  TaskManager.defineTask(COURIER_BACKGROUND_TASK, async ({ data, error }) => {
    if (error) return;
    const deliveryId = await SecureStore.getItemAsync(ACTIVE_DELIVERY_KEY).catch(() => null);
    const availability = await onlineAvailabilityEnabled();
    if (!deliveryId && !availability) {
      await stopTask();
      return;
    }
    const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations || [];
    const latest = locations[locations.length - 1];
    if (!latest) return;
    try {
      if (deliveryId) {
        const delivery = await updateCourierLocation(deliveryId, locationPayload(latest));
        if (!ACTIVE_STATUSES.has(delivery.status)) {
          await SecureStore.deleteItemAsync(ACTIVE_DELIVERY_KEY).catch(() => undefined);
          if (!availability) await stopTask();
        }
        return;
      }
      await updateCourierPresence({
        latitude: latest.coords.latitude,
        longitude: latest.coords.longitude,
        heading: typeof latest.coords.heading === "number" && latest.coords.heading >= 0 ? latest.coords.heading : null,
        speed: typeof latest.coords.speed === "number" && latest.coords.speed >= 0 ? latest.coords.speed : null,
        accuracy: typeof latest.coords.accuracy === "number" && latest.coords.accuracy >= 0 ? latest.coords.accuracy : null,
        timestamp: latest.timestamp,
      });
    } catch (err) {
      if (err instanceof ApiRequestError && [400, 401, 403, 404].includes(err.status || 0)) {
        if (deliveryId) await SecureStore.deleteItemAsync(ACTIVE_DELIVERY_KEY).catch(() => undefined);
        else await SecureStore.deleteItemAsync(ONLINE_AVAILABILITY_KEY).catch(() => undefined);
        const stillDelivery = await SecureStore.getItemAsync(ACTIVE_DELIVERY_KEY).catch(() => null);
        const stillOnline = await onlineAvailabilityEnabled();
        if (!stillDelivery && !stillOnline) await stopTask();
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

export async function startCourierBackgroundAvailabilityTracking() {
  if (Platform.OS !== "android") return false;
  const permission = await getCourierBackgroundLocationPermissionState();
  if (!permission.enabled) return false;
  await SecureStore.setItemAsync(ONLINE_AVAILABILITY_KEY, "true");
  const deliveryId = await SecureStore.getItemAsync(ACTIVE_DELIVERY_KEY).catch(() => null);
  if (deliveryId) return true;
  await startTask("availability");
  return true;
}

export async function stopCourierBackgroundAvailabilityTracking() {
  if (Platform.OS !== "android") return;
  await SecureStore.deleteItemAsync(ONLINE_AVAILABILITY_KEY).catch(() => undefined);
  const deliveryId = await SecureStore.getItemAsync(ACTIVE_DELIVERY_KEY).catch(() => null);
  if (!deliveryId) await stopTask();
}

export async function startCourierBackgroundDeliveryTracking(deliveryId: string) {
  if (Platform.OS === "web") return false;
  const permission = await getCourierBackgroundLocationPermissionState();
  if (!permission.enabled) return false;
  await SecureStore.setItemAsync(ACTIVE_DELIVERY_KEY, deliveryId);
  await startTask("delivery");
  return true;
}

export async function stopCourierBackgroundDeliveryTracking() {
  if (Platform.OS === "web") return;
  await SecureStore.deleteItemAsync(ACTIVE_DELIVERY_KEY).catch(() => undefined);
  if (Platform.OS === "android" && await onlineAvailabilityEnabled()) {
    await startTask("availability").catch(() => undefined);
    return;
  }
  await stopTask();
}

export async function stopAllCourierBackgroundLocation() {
  if (Platform.OS === "web") return;
  await clearAllState();
}
