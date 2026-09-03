import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import MapView, { Marker, Polyline, Region } from "react-native-maps";
import { useEffect, useRef } from "react";

import { v2Theme } from "../../constants/v2Theme";
import { useMotionSettings } from "../../hooks/useMotionSettings";
import { isMapCoordinate } from "../../utils/mapMotion";
import { LiveLocationMarker } from "./LiveLocationMarker";

type Point = {
  latitude?: number | null;
  longitude?: number | null;
  recorded_at?: string | null;
};

type DeliveryMapProps = {
  pickup?: Point | null;
  dropoff?: Point | null;
  courier?: Point | null;
  route?: Array<{ latitude: number; longitude: number }>;
  courierHeading?: number | null;
  liveTracking?: boolean;
  trackingKey?: string;
  height?: number;
};

const ZIMBABWE_REGION: Region = {
  latitude: -19.0154,
  longitude: 29.1549,
  latitudeDelta: 7.4,
  longitudeDelta: 7.4,
};

function validPoint(point?: Point | null): point is { latitude: number; longitude: number } {
  return isMapCoordinate(point);
}

export function DeliveryMap({ pickup, dropoff, courier, route = [], courierHeading, liveTracking = true, trackingKey, height = 340 }: DeliveryMapProps) {
  const { canAnimate } = useMotionSettings();
  const initialRegion = regionForPoints([pickup, dropoff, courier]);
  const mapRef = useRef<MapView | null>(null);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const points = [pickup, dropoff].filter(validPoint);
    if (points.length < 2) return;
    mapRef.current?.fitToCoordinates(points, {
      animated: canAnimate,
      edgePadding: { top: 54, right: 44, bottom: 54, left: 44 },
    });
  }, [dropoff?.latitude, dropoff?.longitude, pickup?.latitude, pickup?.longitude]);

  function recenter() {
    if (!validPoint(courier)) return;
    mapRef.current?.animateCamera(
      {
        center: courier,
        heading: typeof courierHeading === "number" && courierHeading >= 0 ? courierHeading : 0,
        pitch: 0,
        zoom: 16,
      },
      { duration: canAnimate ? 240 : 0 },
    );
  }

  if (Platform.OS === "web") {
    return (
      <View style={[styles.webFallback, { height }]}>
        <MaterialCommunityIcons name="map-outline" size={31} color={v2Theme.colors.brandStrong} />
        <Text style={styles.webTitle}>Live map</Text>
        <Text style={styles.webBody}>Open the iOS or Android app for native live tracking.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.frame, { height }]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        rotateEnabled
        pitchEnabled={false}
        toolbarEnabled={false}
      >
        {route.length > 1 ? (
          <Polyline coordinates={route} strokeColor={v2Theme.colors.brandStrong} strokeWidth={5} lineCap="round" lineJoin="round" />
        ) : null}
        {validPoint(pickup) ? (
          <Marker coordinate={pickup} anchor={{ x: 0.5, y: 0.5 }}>
            <MapMarker icon="circle-slice-8" label="Pickup" tone="brand" />
          </Marker>
        ) : null}
        {validPoint(dropoff) ? (
          <Marker coordinate={dropoff} anchor={{ x: 0.5, y: 0.5 }}>
            <MapMarker icon="map-marker" label="Drop-off" />
          </Marker>
        ) : null}
        {validPoint(courier) ? (
          <LiveLocationMarker key={trackingKey} location={courier} heading={courierHeading} title="Courier" animate={liveTracking}>
            <CourierMarker />
          </LiveLocationMarker>
        ) : null}
      </MapView>
      {validPoint(courier) ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Recenter live courier" onPress={recenter} style={({ pressed }) => [styles.recenter, pressed && styles.recenterPressed]}>
          <MaterialCommunityIcons name="crosshairs-gps" size={21} color={v2Theme.colors.ink} />
        </Pressable>
      ) : null}
    </View>
  );
}

function CourierMarker() {
  return (
    <View style={[styles.marker, styles.markerAccent]}>
      <MaterialCommunityIcons name="motorbike" size={18} color="#FFFFFF" />
    </View>
  );
}

function MapMarker({
  icon,
  label,
  tone = "neutral",
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  tone?: "neutral" | "brand" | "courier";
}) {
  const accent = tone === "brand" || tone === "courier";
  return (
    <View style={styles.markerWrap}>
      <View style={[styles.marker, accent && styles.markerAccent]}>
        <MaterialCommunityIcons
          name={icon}
          size={18}
          color={accent ? "#FFFFFF" : v2Theme.colors.ink}
        />
      </View>
      <View style={styles.markerLabelWrap}>
        <Text style={styles.markerLabel}>{label}</Text>
      </View>
    </View>
  );
}

function regionForPoints(points: Array<Point | null | undefined>): Region {
  const valid = points.filter(validPoint);
  if (!valid.length) return ZIMBABWE_REGION;

  const latitudes = valid.map((point) => point.latitude);
  const longitudes = valid.map((point) => point.longitude);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.8, 0.035),
    longitudeDelta: Math.max((maxLng - minLng) * 1.8, 0.035),
  };
}

const styles = StyleSheet.create({
  frame: {
    overflow: "hidden",
    borderRadius: v2Theme.radius.xxl,
    backgroundColor: v2Theme.colors.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: v2Theme.colors.lineStrong,
  },
  markerWrap: {
    alignItems: "center",
  },
  marker: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: v2Theme.colors.surface,
    borderWidth: 2,
    borderColor: v2Theme.colors.ink,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: v2Theme.colors.shadow,
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  markerAccent: {
    backgroundColor: v2Theme.colors.brand,
    borderColor: "#FFFFFF",
  },
  markerLabelWrap: {
    marginTop: 4,
    borderRadius: v2Theme.radius.pill,
    backgroundColor: "rgba(16,18,16,0.88)",
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  markerLabel: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "900",
  },
  webFallback: {
    borderRadius: v2Theme.radius.xxl,
    backgroundColor: v2Theme.colors.brandSofter,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 7,
  },
  webTitle: {
    color: v2Theme.colors.ink,
    fontSize: 17,
    fontWeight: "900",
  },
  webBody: {
    color: v2Theme.colors.inkSecondary,
    fontSize: 12,
    textAlign: "center",
  },
  recenter: {
    position: "absolute",
    right: 13,
    bottom: 13,
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.96)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: v2Theme.colors.shadow,
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 7,
  },
  recenterPressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
});
