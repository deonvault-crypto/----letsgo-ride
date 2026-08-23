import { Animated, Platform, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import MapView, { Marker, Polyline, Region } from "react-native-maps";
import { useEffect, useRef } from "react";

import { v2Theme } from "../../constants/v2Theme";

type Point = {
  latitude?: number | null;
  longitude?: number | null;
};

type DeliveryMapProps = {
  pickup?: Point | null;
  dropoff?: Point | null;
  courier?: Point | null;
  route?: Array<{ latitude: number; longitude: number }>;
  height?: number;
};

const ZIMBABWE_REGION: Region = {
  latitude: -19.0154,
  longitude: 29.1549,
  latitudeDelta: 7.4,
  longitudeDelta: 7.4,
};

function validPoint(point?: Point | null): point is { latitude: number; longitude: number } {
  return typeof point?.latitude === "number" && typeof point?.longitude === "number";
}

export function DeliveryMap({ pickup, dropoff, courier, route = [], height = 340 }: DeliveryMapProps) {
  const initialRegion = regionForPoints([pickup, dropoff, courier]);
  const mapRef = useRef<MapView | null>(null);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const points = [...route, pickup, dropoff, courier].filter(validPoint);
    if (points.length < 2) return;
    mapRef.current?.fitToCoordinates(points, {
      animated: true,
      edgePadding: { top: 54, right: 44, bottom: 54, left: 44 },
    });
  }, [courier?.latitude, courier?.longitude, dropoff?.latitude, dropoff?.longitude, pickup?.latitude, pickup?.longitude, route]);

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
        rotateEnabled={false}
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
          <Marker coordinate={courier} anchor={{ x: 0.5, y: 0.5 }}>
            <CourierMarker />
          </Marker>
        ) : null}
      </MapView>
    </View>
  );
}

function CourierMarker() {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1600, useNativeDriver: true }),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);
  return (
    <View style={styles.markerWrap}>
      <Animated.View
        style={[
          styles.livePulse,
          {
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.34, 0] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1.65] }) }],
          },
        ]}
      />
      <View style={[styles.marker, styles.markerAccent]}>
        <MaterialCommunityIcons name="motorbike" size={18} color="#FFFFFF" />
      </View>
      <View style={styles.markerLabelWrap}><Text style={styles.markerLabel}>Courier</Text></View>
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
  livePulse: {
    position: "absolute",
    top: -3,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: v2Theme.colors.brand,
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
});
