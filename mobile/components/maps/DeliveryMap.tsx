import { Platform, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import MapView, { Marker, Region } from "react-native-maps";

import { v2Theme } from "../../constants/v2Theme";

type Point = {
  latitude?: number | null;
  longitude?: number | null;
};

type DeliveryMapProps = {
  pickup?: Point | null;
  dropoff?: Point | null;
  courier?: Point | null;
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

export function DeliveryMap({ pickup, dropoff, courier, height = 340 }: DeliveryMapProps) {
  if (Platform.OS === "web") {
    return (
      <View style={[styles.webFallback, { height }]}>
        <MaterialCommunityIcons name="map-outline" size={31} color={v2Theme.colors.brandStrong} />
        <Text style={styles.webTitle}>Live map</Text>
        <Text style={styles.webBody}>Open the iOS or Android app for native live tracking.</Text>
      </View>
    );
  }

  const initialRegion = regionForPoints([pickup, dropoff, courier]);

  return (
    <View style={[styles.frame, { height }]}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
      >
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
            <MapMarker icon="motorbike" label="Courier" tone="courier" />
          </Marker>
        ) : null}
      </MapView>
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
});
