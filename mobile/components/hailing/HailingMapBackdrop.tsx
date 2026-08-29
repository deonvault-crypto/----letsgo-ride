import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";

import { HailingCoordinate, HailingRoute } from "../../types/hailing.types";

type HailingMapBackdropProps = {
  pickup?: HailingCoordinate | null;
  dropoff?: HailingCoordinate | null;
  route?: HailingRoute | null;
  driverLocation?: HailingCoordinate | null;
  bottomPadding?: number;
};

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

export function HailingMapBackdrop({
  pickup,
  dropoff,
  route,
  driverLocation,
  bottomPadding = 360,
}: HailingMapBackdropProps) {
  const mapRef = useRef<MapView | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const routeCoordinates = useMemo(
    () => decodePolyline(route?.polyline || route?.encoded_polyline),
    [route?.encoded_polyline, route?.polyline],
  );
  const focusCoordinates = useMemo(() => {
    if (routeCoordinates.length > 1) return routeCoordinates;
    return [pickup, dropoff, driverLocation].filter(Boolean) as HailingCoordinate[];
  }, [driverLocation, dropoff, pickup, routeCoordinates]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || focusCoordinates.length === 0) return;
    if (focusCoordinates.length === 1) {
      mapRef.current.animateToRegion(regionFor(focusCoordinates[0]), 220);
      return;
    }
    mapRef.current.fitToCoordinates(focusCoordinates, {
      animated: true,
      edgePadding: { top: 118, right: 52, bottom: bottomPadding, left: 52 },
    });
  }, [bottomPadding, focusCoordinates, mapReady]);

  return (
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
    </MapView>
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
});
