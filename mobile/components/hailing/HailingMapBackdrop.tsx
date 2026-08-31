import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import MapView, { Circle, Marker, Polyline } from "react-native-maps";

import {
  DeviceLocation,
  getCurrentDeviceLocation,
  getForegroundLocationPermissionState,
  openLocationSettings,
  requestForegroundLocationPermission,
  watchForegroundLocation,
} from "../../services/locationService";
import { HailingCoordinate, HailingRoute } from "../../types/hailing.types";

type HailingMapBackdropProps = {
  pickup?: HailingCoordinate | null;
  dropoff?: HailingCoordinate | null;
  route?: HailingRoute | null;
  driverLocation?: HailingCoordinate | null;
  bottomPadding?: number;
  showCurrentLocation?: boolean;
  promptForLocation?: boolean;
  showLocateControl?: boolean;
  locateButtonBottom?: number;
};

type LocationUiState = "idle" | "locating" | "ready" | "denied" | "settings" | "error";

const HARARE_REGION = {
  latitude: -17.824858,
  longitude: 31.053028,
  latitudeDelta: 0.11,
  longitudeDelta: 0.11,
};

function decodePolyline(encoded?: string | null): HailingCoordinate[] {
  if (!encoded) return [];
  const points: HailingCoordinate[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    latitude += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    longitude += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ latitude: latitude / 1e5, longitude: longitude / 1e5 });
  }

  return points;
}

function regionFor(point?: HailingCoordinate | null) {
  if (!point) return HARARE_REGION;
  return {
    latitude: point.latitude,
    longitude: point.longitude,
    latitudeDelta: 0.045,
    longitudeDelta: 0.045,
  };
}

function coordinateFor(location: DeviceLocation): HailingCoordinate {
  return { latitude: location.latitude, longitude: location.longitude };
}

export function HailingMapBackdrop({
  pickup,
  dropoff,
  route,
  driverLocation,
  bottomPadding = 360,
  showCurrentLocation = false,
  promptForLocation = false,
  showLocateControl = false,
  locateButtonBottom,
}: HailingMapBackdropProps) {
  const mapRef = useRef<MapView | null>(null);
  const watcherRef = useRef<{ remove: () => void } | null>(null);
  const approximatePromptShownRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [deviceLocation, setDeviceLocation] = useState<DeviceLocation | null>(null);
  const [locationState, setLocationState] = useState<LocationUiState>("idle");
  const routeCoordinates = useMemo(
    () => decodePolyline(route?.polyline || route?.encoded_polyline),
    [route?.encoded_polyline, route?.polyline],
  );
  const focusCoordinates = useMemo(() => {
    if (routeCoordinates.length > 1) return routeCoordinates;
    return [pickup, dropoff, driverLocation].filter(Boolean) as HailingCoordinate[];
  }, [driverLocation, dropoff, pickup, routeCoordinates]);

  function centerOnDevice(location: DeviceLocation, animated = true) {
    if (!mapReady || !mapRef.current) return;
    mapRef.current.animateToRegion(
      {
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.012,
        longitudeDelta: 0.012,
      },
      animated ? 260 : 0,
    );
  }

  function updateDeviceLocation(location: DeviceLocation, recenter = false) {
    setDeviceLocation(location);
    setLocationState("ready");
    if (recenter) centerOnDevice(location);
  }

  async function startLocationTracking(askIfNeeded: boolean, recenter = false) {
    if (!showCurrentLocation) return;
    setLocationState("locating");
    try {
      let permission = await getForegroundLocationPermissionState();
      if (!permission.enabled && askIfNeeded && permission.canAskAgain) {
        permission = await requestForegroundLocationPermission();
      }
      if (!permission.enabled) {
        setLocationState(permission.requiresSettings ? "settings" : "denied");
        return;
      }

      const current = await getCurrentDeviceLocation();
      updateDeviceLocation(current, recenter || !deviceLocation);

      watcherRef.current?.remove();
      watcherRef.current = await watchForegroundLocation(
        (next) => updateDeviceLocation(next),
        () => setLocationState("error"),
        { timeInterval: 5000, distanceInterval: 6 },
      );
    } catch {
      setLocationState("error");
    }
  }

  async function recenterOnMe() {
    const permission = await getForegroundLocationPermissionState().catch(() => null);
    if (!permission?.enabled) {
      if (permission?.requiresSettings) {
        Alert.alert(
          "Turn on location",
          "LetsGoRide needs location access to put the map on your real position.",
          [
            { text: "Not now", style: "cancel" },
            { text: "Open Settings", onPress: () => void openLocationSettings() },
          ],
        );
        setLocationState("settings");
        return;
      }
      await startLocationTracking(true, true);
      return;
    }

    await startLocationTracking(false, true);
    const next = await getCurrentDeviceLocation().catch(() => null);
    if (next && typeof next.accuracy === "number" && next.accuracy > 250 && !approximatePromptShownRef.current) {
      approximatePromptShownRef.current = true;
      Alert.alert(
        "Improve location accuracy",
        "Your phone is only giving LetsGoRide an approximate position. Turn on Precise Location for accurate pickups and recentering.",
        [
          { text: "Later", style: "cancel" },
          { text: "Open Settings", onPress: () => void openLocationSettings() },
        ],
      );
    }
  }

  useEffect(() => {
    if (!showCurrentLocation) return undefined;
    void startLocationTracking(promptForLocation, true);
    return () => {
      watcherRef.current?.remove();
      watcherRef.current = null;
    };
    // Location tracking is intentionally tied only to whether this map opts in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCurrentLocation]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    if (focusCoordinates.length === 0) {
      if (showCurrentLocation && deviceLocation) centerOnDevice(deviceLocation, false);
      return;
    }
    if (focusCoordinates.length === 1) {
      mapRef.current.animateToRegion(regionFor(focusCoordinates[0]), 220);
      return;
    }
    mapRef.current.fitToCoordinates(focusCoordinates, {
      animated: true,
      edgePadding: { top: 118, right: 52, bottom: bottomPadding, left: 52 },
    });
  }, [bottomPadding, deviceLocation, focusCoordinates, mapReady, showCurrentLocation]);

  const deviceCoordinate = deviceLocation ? coordinateFor(deviceLocation) : null;
  const accuracyRadius = deviceLocation?.accuracy
    ? Math.max(18, Math.min(deviceLocation.accuracy, 300))
    : 24;
  const locateBottom = locateButtonBottom ?? Math.max(bottomPadding + 18, 96);

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={regionFor(pickup || dropoff)}
        onMapReady={() => setMapReady(true)}
        pitchEnabled={false}
        rotateEnabled={false}
        showsCompass={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        moveOnMarkerPress={false}
      >
        {routeCoordinates.length > 1 ? (
          <Polyline coordinates={routeCoordinates} strokeColor="#111111" strokeWidth={4} lineCap="round" lineJoin="round" />
        ) : null}

        {pickup ? (
          <Marker coordinate={pickup} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <View style={styles.pickupOuter}>
              <View style={styles.pickupInner} />
            </View>
          </Marker>
        ) : null}

        {dropoff ? (
          <Marker coordinate={dropoff} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <View style={styles.dropoffOuter}>
              <View style={styles.dropoffInner} />
            </View>
          </Marker>
        ) : null}

        {driverLocation ? (
          <Marker coordinate={driverLocation} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <View style={styles.driverMarker}>
              <MaterialCommunityIcons name="car" size={17} color="#FFFFFF" />
            </View>
          </Marker>
        ) : null}

        {showCurrentLocation && deviceCoordinate ? (
          <>
            <Circle
              center={deviceCoordinate}
              radius={accuracyRadius}
              fillColor="rgba(43,124,255,0.10)"
              strokeColor="rgba(43,124,255,0.20)"
              strokeWidth={1}
            />
            <Marker coordinate={deviceCoordinate} anchor={{ x: 0.5, y: 0.5 }} zIndex={50}>
              <View style={styles.locationHalo}>
                <View style={styles.locationPuck}>
                  <MaterialCommunityIcons
                    name={typeof deviceLocation.heading === "number" ? "navigation-variant" : "circle"}
                    size={typeof deviceLocation.heading === "number" ? 14 : 7}
                    color="#FFFFFF"
                    style={typeof deviceLocation.heading === "number"
                      ? { transform: [{ rotate: `${deviceLocation.heading}deg` }] }
                      : undefined}
                  />
                </View>
              </View>
            </Marker>
          </>
        ) : null}
      </MapView>

      {showCurrentLocation && showLocateControl ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Locate me"
          accessibilityHint="Centers the map on your current location"
          onPress={() => void recenterOnMe()}
          style={({ pressed }) => [
            styles.locateButton,
            { bottom: locateBottom },
            locationState !== "ready" && styles.locateButtonNeedsLocation,
            pressed && styles.locateButtonPressed,
          ]}
        >
          <MaterialCommunityIcons
            name={locationState === "locating" ? "crosshairs" : "crosshairs-gps"}
            size={22}
            color="#111111"
          />
          {locationState !== "ready" && locationState !== "locating" ? <View style={styles.locationAlertDot} /> : null}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pickupOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 3,
    borderColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  pickupInner: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#111111" },
  dropoffOuter: {
    width: 24,
    height: 24,
    borderRadius: 7,
    backgroundColor: "#FFFFFF",
    borderWidth: 3,
    borderColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  dropoffInner: { width: 8, height: 8, borderRadius: 2, backgroundColor: "#111111" },
  driverMarker: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#111111",
    borderWidth: 3,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.22,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  locationHalo: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.72)",
    shadowColor: "#000000",
    shadowOpacity: 0.22,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 7,
  },
  locationPuck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2B7CFF",
    borderWidth: 2.5,
    borderColor: "#FFFFFF",
  },
  locateButton: {
    position: "absolute",
    right: 16,
    zIndex: 8,
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.97)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(17,17,17,0.10)",
    shadowColor: "#000000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 7,
  },
  locateButtonNeedsLocation: {
    borderColor: "rgba(217,121,43,0.42)",
  },
  locateButtonPressed: {
    opacity: 0.74,
    transform: [{ scale: 0.96 }],
  },
  locationAlertDot: {
    position: "absolute",
    top: 5,
    right: 5,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#D9792B",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
});
