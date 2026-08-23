import { forwardRef, useImperativeHandle, useRef } from "react";
import { StyleProp, ViewStyle } from "react-native";
import MapView, { Region } from "react-native-maps";

export type MapRegion = Region;

export type LocationPickerMapHandle = {
  focus: (region: Region) => void;
};

type LocationPickerMapProps = {
  initialRegion: Region;
  onRegionChangeComplete: (region: Region) => void;
  style?: StyleProp<ViewStyle>;
};

export const LocationPickerMap = forwardRef<LocationPickerMapHandle, LocationPickerMapProps>(
  function LocationPickerMap({ initialRegion, onRegionChangeComplete, style }, forwardedRef) {
    const mapRef = useRef<MapView | null>(null);
    useImperativeHandle(forwardedRef, () => ({
      focus(region) {
        mapRef.current?.animateToRegion(region, 320);
      },
    }));

    return (
      <MapView
        ref={mapRef}
        style={style}
        initialRegion={initialRegion}
        onRegionChangeComplete={onRegionChangeComplete}
      />
    );
  },
);
