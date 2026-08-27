import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import * as Location from "expo-location";
import MapView, { Marker, Polyline } from "react-native-maps";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { colors } from "../../constants/colors";
import { coordinateForPlace } from "../../constants/cityCoordinates";
import { spacing } from "../../constants/spacing";
import { useRideLiveRealtime } from "../../hooks/useRideLiveRealtime";
import { disableLiveTripLocation, endTrip, updateLiveTripLocation } from "../../services/ridesService";
import { LiveTripLocation, Ride } from "../../types/ride.types";
import { canonicalRideStatus, tripStatusLabel } from "../../utils/tripLifecycle";
import { AppButton } from "../ui/AppButton";
import { StatusBadge } from "../ui/StatusBadge";

type LiveTripPanelProps = {
  ride: Ride;
  role: "driver" | "passenger";
  onRideMutation?: (ride: Ride) => void;
};

type MapPoint = {
  latitude: number;
  longitude: number;
};

const LOCATION_OPTIONS: Location.LocationOptions = {
  accuracy: Location.Accuracy.Balanced,
  timeInterval: 20000,
  distanceInterval: 100,
};

export function LiveTripPanel({ ride, role, onRideMutation }: LiveTripPanelProps) {
  const passengerRealtime = useRideLiveRealtime(ride, role === "passenger");
  const [liveLocation, setLiveLocation] = useState<LiveTripLocation | null>(ride.last_driver_location || null);
  const [liveSharingEnabled, setLiveSharingEnabled] = useState(Boolean(ride.live_tracking_active));
  const [watching, setWatching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const watchGeneration = useRef(0);
  const watchStartingGeneration = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const resumeDriverWatcher = useRef(false);
  const effectiveStatus = role === "passenger" && passengerRealtime.state ? passengerRealtime.state.status : ride.status;
  const active = canonicalRideStatus(effectiveStatus) === "IN_PROGRESS" || (role === "driver" && ride.legacy_status === "departed");

  const originPoint = useMemo(() => coordinateForPlace(ride.origin), [ride.origin]);
  const destinationPoint = useMemo(() => coordinateForPlace(ride.destination), [ride.destination]);
  const driverPoint = liveLocation ? { latitude: liveLocation.latitude, longitude: liveLocation.longitude } : null;
  const mapPoints = useMemo(() => [originPoint, driverPoint, destinationPoint].filter(Boolean) as MapPoint[], [originPoint, driverPoint, destinationPoint]);
  const nearDestination = Boolean(driverPoint && destinationPoint && distanceMeters(driverPoint, destinationPoint) <= 500);

  const region = useMemo(() => {
    if (mapPoints.length === 0) return null;
    const latitudes = mapPoints.map((point) => point.latitude);
    const longitudes = mapPoints.map((point) => point.longitude);
    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLng = Math.min(...longitudes);
    const maxLng = Math.max(...longitudes);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max(0.08, (maxLat - minLat) * 1.8),
      longitudeDelta: Math.max(0.08, (maxLng - minLng) * 1.8),
    };
  }, [mapPoints]);

  const stopWatching = useCallback(() => {
    watchGeneration.current += 1;
    watchStartingGeneration.current = null;
    watchRef.current?.remove();
    watchRef.current = null;
    if (mountedRef.current) {
      setWatching(false);
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      watchGeneration.current += 1;
      watchStartingGeneration.current = null;
      watchRef.current?.remove();
      watchRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!active) {
      resumeDriverWatcher.current = false;
      stopWatching();
      setLiveSharingEnabled(false);
    }
  }, [active, stopWatching]);

  useEffect(() => {
    if (role !== "passenger" || !passengerRealtime.state) return;
    setLiveSharingEnabled(Boolean(passengerRealtime.state.live_tracking_enabled));
    setLiveLocation(passengerRealtime.state.last_driver_location || null);
    setError(passengerRealtime.error);
  }, [passengerRealtime.error, passengerRealtime.state, role]);

  const sendLocation = useCallback(async (position: Location.LocationObject, generation?: number) => {
    const isCurrent = () => mountedRef.current && (generation === undefined || generation === watchGeneration.current);
    if (!isCurrent()) return;
    const nextLocation = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      heading: position.coords.heading,
      speed: position.coords.speed,
    };
    setLiveLocation(nextLocation);
    try {
      const response = await updateLiveTripLocation(ride.id, nextLocation);
      if (!isCurrent()) return;
      setLiveSharingEnabled(response.live_tracking_enabled);
      onRideMutation?.({
        ...ride,
        realtime_version: response.realtime_version,
        status: response.status,
        live_tracking_active: response.live_tracking_enabled,
        last_driver_location: response.last_driver_location,
      });
      setError("");
    } catch (err) {
      if (isCurrent()) setError(err instanceof Error ? err.message : "Could not share live location.");
    }
  }, [onRideMutation, ride]);

  const enableLiveSharing = useCallback(async () => {
    if (watchRef.current || watchStartingGeneration.current !== null) return;
    const generation = ++watchGeneration.current;
    watchStartingGeneration.current = generation;
    const isCurrent = () => mountedRef.current && generation === watchGeneration.current;
    try {
      setBusy(true);
      setError("");
      const currentPermission = await Location.getForegroundPermissionsAsync();
      if (!isCurrent()) return;
      const permission = currentPermission.granted ? currentPermission : await Location.requestForegroundPermissionsAsync();
      if (!isCurrent()) return;
      if (!permission.granted) {
        setError("Location permission is off. Enable it to share live trip progress during this ride.");
        return;
      }
      const currentPosition = await Location.getCurrentPositionAsync(LOCATION_OPTIONS);
      if (!isCurrent()) return;
      await sendLocation(currentPosition, generation);
      if (!isCurrent()) return;
      const watcher = await Location.watchPositionAsync(LOCATION_OPTIONS, (position) => {
        void sendLocation(position, generation);
      });
      if (!isCurrent() || AppState.currentState !== "active") {
        watcher.remove();
        resumeDriverWatcher.current = true;
        return;
      }
      watchRef.current = watcher;
      setWatching(true);
    } catch (err) {
      if (isCurrent()) setError(err instanceof Error ? err.message : "Could not start live sharing.");
    } finally {
      if (watchStartingGeneration.current === generation) {
        watchStartingGeneration.current = null;
        if (mountedRef.current) setBusy(false);
      }
    }
  }, [sendLocation]);

  useEffect(() => {
    if (role !== "driver") return undefined;
    if (AppState.currentState !== "active" && active && liveSharingEnabled) {
      resumeDriverWatcher.current = true;
    }
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") {
        if (active && liveSharingEnabled) resumeDriverWatcher.current = true;
        stopWatching();
        return;
      }
      if (active && liveSharingEnabled && resumeDriverWatcher.current) {
        resumeDriverWatcher.current = false;
        void enableLiveSharing();
      }
    });
    return () => subscription.remove();
  }, [active, enableLiveSharing, liveSharingEnabled, role, stopWatching]);

  async function disableSharing() {
    try {
      setBusy(true);
      setError("");
      resumeDriverWatcher.current = false;
      stopWatching();
      const updated = await disableLiveTripLocation(ride.id);
      setLiveSharingEnabled(false);
      onRideMutation?.(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not stop live sharing.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmArrival() {
    try {
      setBusy(true);
      setError("");
      stopWatching();
      onRideMutation?.(await endTrip(ride.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete this trip.");
    } finally {
      setBusy(false);
    }
  }

  if (!active) {
    return (
      <View style={styles.card}>
        <View style={styles.titleRow}>
          <MaterialCommunityIcons name="map-marker-path" size={22} color={colors.primaryGreen} />
          <Text style={styles.title}>Live trip</Text>
        </View>
        <Text style={styles.body}>Live progress becomes available after the trip starts.</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <MaterialCommunityIcons name="map-marker-path" size={22} color={colors.primaryGreen} />
        <Text style={styles.title}>Live trip</Text>
        <StatusBadge label={tripStatusLabel(effectiveStatus)} tone="warning" />
      </View>
      <Text style={styles.body}>
        {role === "driver"
          ? "Share live progress only while this trip is in progress. LetsGoRide stops sharing when the trip ends."
          : "Track live progress for this confirmed trip when the driver has sharing on."}
      </Text>

      {region ? (
        <View style={styles.mapWrap}>
          <MapView style={styles.map} initialRegion={region} region={region} scrollEnabled={false} zoomEnabled={false} pitchEnabled={false} rotateEnabled={false}>
            {originPoint ? <Marker coordinate={originPoint} title="Pickup" pinColor={colors.primaryGreen} /> : null}
            {destinationPoint ? <Marker coordinate={destinationPoint} title="Destination" pinColor={colors.danger} /> : null}
            {driverPoint ? <Marker coordinate={driverPoint} title="Driver" pinColor={colors.warning} /> : null}
            {originPoint && destinationPoint ? <Polyline coordinates={[originPoint, destinationPoint]} strokeColor={colors.primaryGreen} strokeWidth={3} /> : null}
            {driverPoint && destinationPoint ? <Polyline coordinates={[driverPoint, destinationPoint]} strokeColor={colors.warning} strokeWidth={3} lineDashPattern={[8, 6]} /> : null}
          </MapView>
        </View>
      ) : (
        <View style={styles.mapFallback}>
          <MaterialCommunityIcons name="map-outline" size={30} color={colors.mutedText} />
          <Text style={styles.body}>Map preview is unavailable for this route.</Text>
        </View>
      )}

      {liveLocation?.updated_at ? <Text style={styles.helper}>Last update: {new Date(liveLocation.updated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text> : null}
      {!liveSharingEnabled && role === "passenger" ? <Text style={styles.helper}>Waiting for driver live location.</Text> : null}
      {role === "driver" && nearDestination ? (
        <View style={styles.arrivalPrompt}>
          <Text style={styles.title}>Have you arrived?</Text>
          <Text style={styles.body}>You are close to the destination. End the trip when passengers have arrived safely.</Text>
          <AppButton title="End Trip" loading={busy} onPress={confirmArrival} />
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {role === "driver" ? (
        liveSharingEnabled && watching ? (
          <AppButton title="Stop live sharing" variant="secondary" loading={busy} onPress={disableSharing} />
        ) : (
          <AppButton title="Share live location" loading={busy} onPress={enableLiveSharing} />
        )
      ) : null}
    </View>
  );
}

function distanceMeters(a: MapPoint, b: MapPoint) {
  const radius = 6371000;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * radius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 24,
    padding: spacing.lg,
    gap: spacing.md,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  title: {
    color: colors.whiteText,
    fontSize: 18,
    fontWeight: "900",
  },
  body: {
    color: colors.mutedText,
    lineHeight: 21,
  },
  helper: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: "700",
  },
  error: {
    color: colors.danger,
    fontWeight: "800",
    lineHeight: 20,
  },
  mapWrap: {
    height: 220,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  map: {
    flex: 1,
  },
  mapFallback: {
    minHeight: 140,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.lg,
  },
  arrivalPrompt: {
    backgroundColor: colors.surface,
    borderColor: "rgba(17,139,68,0.18)",
    borderWidth: 1,
    borderRadius: 20,
    padding: spacing.md,
    gap: spacing.sm,
  },
});
