import { forwardRef, useImperativeHandle } from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { v2Theme } from "../../constants/v2Theme";

export type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export type LocationPickerMapHandle = {
  focus: (region: MapRegion) => void;
};

type LocationPickerMapProps = {
  initialRegion: MapRegion;
  onMovementStart?: () => void;
  onRegionChangeComplete: (region: MapRegion) => void;
  style?: StyleProp<ViewStyle>;
};

export const LocationPickerMap = forwardRef<LocationPickerMapHandle, LocationPickerMapProps>(
  function LocationPickerMap(_props, forwardedRef) {
    useImperativeHandle(forwardedRef, () => ({ focus() {} }));
    return (
      <View style={[styles.fallback, _props.style]}>
        <View style={styles.routeLine} />
        <MaterialCommunityIcons name="map-marker" size={42} color={v2Theme.colors.brandStrong} />
        <Text style={styles.title}>Location preview</Text>
        <Text style={styles.body}>Search, current location and saved places work here. Drag the precision pin in the iOS or Android app.</Text>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  fallback: { alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: v2Theme.colors.brandSofter, padding: 26, overflow: "hidden" },
  routeLine: { position: "absolute", width: "76%", height: 90, borderWidth: 3, borderColor: "rgba(20,157,72,0.18)", borderRadius: 90, transform: [{ rotate: "-12deg" }] },
  title: { color: v2Theme.colors.ink, fontSize: 17, fontWeight: "900" },
  body: { maxWidth: 330, color: v2Theme.colors.inkSecondary, fontSize: 11, lineHeight: 16, textAlign: "center" },
});
