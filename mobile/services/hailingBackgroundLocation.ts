import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";

import { ApiRequestError } from "./api";
import { updateHailingTripLocation } from "./hailingService";

export const HAILING_DRIVER_BACKGROUND_TASK = "letsgoride-hailing-driver-background-location";
const ACTIVE_TRIP_KEY = "letsgoride.hailing.background-trip-id";
const ACTIVE_STATUSES = new Set(["DRIVER_ASSIGNED", "DRIVER_EN_ROUTE", "DRIVER_ARRIVED", "PASSENGER_CONFIRMED_BOARDING", "IN_PROGRESS"]);

export type BackgroundLocationPermissionState = {
  enabled: boolean;
  canAskAgain: boolean;
  requiresSettings: boolean;
};

function locationPayload(location: Location.LocationObject) {
  return {
    location: { latitude: location.coords.latitude, longitude: location.coords.longitude },
    heading: typeof location.coords.heading === "number" && location.coords.heading >= 0 ? location.coords.heading : null,
    speed: typeof location.coords.speed === "number" && location.coords.speed >= 0 ? location.coords.speed : null,
    accuracy: typeof location.coords.accuracy === "number" && location.coords.accuracy >= 0 ? location.coords.accuracy : null,
  };
}

async function stopTaskAndClearTrip() {
  await SecureStore.deleteItemAsync(ACTIVE_TRIP_KEY).catch(() => undefined);
  const registered = await Location.hasStartedLocationUpdatesAsync(HAILING_DRIVER_BACKGROUND_TASK).catch(() => false);
  if (registered) await Location.stopLocationUpdatesAsync(HAILING_DRIVER_BACKGROUND_TASK).catch(() => undefined);
}

if (Platform.OS !== "web" && !TaskManager.isTaskDefined(HAILING_DRIVER_BACKGROUND_TASK)) {
  TaskManager.defineTask(HAILING_DRIVER_BACKGROUND_TASK, async ({ data, error }) => {
    if (error) return;
    const tripId = await SecureStore.getItemAsync(ACTIVE_TRIP_KEY).catch(() => null);
    if (!tripId) {
      await stopTaskAndClearTrip();
      return;
    }
    const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations || [];
    const latest = locations[locations.length - 1];
    if (!latest) return;
    try {
      const trip = await updateHailingTripLocation(tripId, locationPayload(latest));
      if (!ACTIVE_STATUSES.has(trip.status)) await stopTaskAndClearTrip();
    } catch (err) {
      if (err instanceof ApiRequestError && [400, 401, 403, 404].includes(err.status || 0)) {
        await stopTaskAndClearTrip();
      }
      // Network/provider failures keep the task registered so a later location can retry.
    }
  });
}

function permissionState(response: Location.PermissionResponse): BackgroundLocationPermissionState {
  return { enabled: response.granted, canAskAgain: response.canAskAgain, requiresSettings: !response.granted && !response.canAskAgain };
}

export async function getDriverBackgroundLocationPermissionState() {
  if (Platform.OS === "web") return { enabled: false, canAskAgain: false, requiresSettings: false };
  return permissionState(await Location.getBackgroundPermissionsAsync());
}

export async function requestDriverBackgroundLocationPermission() {
  const foreground = await Location.getForegroundPermissionsAsync();
  if (!foreground.granted) {
    const requestedForeground = await Location.requestForegroundPermissionsAsync();
    if (!requestedForeground.granted) return { enabled: false, canAskAgain: requestedForeground.canAskAgain, requiresSettings: !requestedForeground.canAskAgain };
  }
  return permissionState(await Location.requestBackgroundPermissionsAsync());
}

export async function startDriverBackgroundTripTracking(tripId: string) {
  if (Platform.OS === "web") return false;
  const permission = await getDriverBackgroundLocationPermissionState();
  if (!permission.enabled) return false;
  await SecureStore.setItemAsync(ACTIVE_TRIP_KEY, tripId);
  const running = await Location.hasStartedLocationUpdatesAsync(HAILING_DRIVER_BACKGROUND_TASK).catch(() => false);
  if (running) return true;
  await Location.startLocationUpdatesAsync(HAILING_DRIVER_BACKGROUND_TASK, {
    accuracy: Location.Accuracy.High,
    distanceInterval: 25,
    timeInterval: 10000,
    deferredUpdatesDistance: 40,
    deferredUpdatesInterval: 15000,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.AutomotiveNavigation,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "LetsGoRide active trip",
      notificationBody: "Sharing your location for the active Ride Now trip.",
      notificationColor: "#111111",
      killServiceOnDestroy: false,
    },
  });
  return true;
}

export async function stopDriverBackgroundTripTracking() {
  if (Platform.OS === "web") return;
  await stopTaskAndClearTrip();
}
