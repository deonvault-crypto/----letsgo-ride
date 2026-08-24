import { forwardRef, memo, useCallback, useImperativeHandle, useRef } from "react";
import { StyleProp, ViewStyle } from "react-native";
import MapView, { Region } from "react-native-maps";

export type MapRegion = Region;

export type LocationPickerMapHandle = {
  focus: (region: Region) => void;
};

type LocationPickerMapProps = {
  initialRegion: Region;
  onMovementStart?: () => void;
  onRegionChangeComplete: (region: Region) => void;
  style?: StyleProp<ViewStyle>;
};

const NativeLocationPickerMap = forwardRef<LocationPickerMapHandle, LocationPickerMapProps>(
  function NativeLocationPickerMap({ initialRegion, onMovementStart, onRegionChangeComplete, style }, forwardedRef) {
    const mapRef = useRef<MapView | null>(null);
    const initialRegionRef = useRef(initialRegion);
    const userMovement = useRef(false);
    const movementStartRef = useRef(onMovementStart);
    const movementCompleteRef = useRef(onRegionChangeComplete);
    movementStartRef.current = onMovementStart;
    movementCompleteRef.current = onRegionChangeComplete;
    useImperativeHandle(forwardedRef, () => ({
      focus(region) {
        mapRef.current?.animateToRegion(region, 320);
      },
    }));

    const beginUserMovement = useCallback(() => {
      if (!userMovement.current) movementStartRef.current?.();
      userMovement.current = true;
    }, []);

    const finishMovement = useCallback((region: Region) => {
      if (!userMovement.current) return;
      userMovement.current = false;
      movementCompleteRef.current(region);
    }, []);

    return (
      <MapView
        ref={mapRef}
        style={style}
        initialRegion={initialRegionRef.current}
        onPanDrag={beginUserMovement}
        onRegionChangeComplete={finishMovement}
      />
    );
  },
);

export const LocationPickerMap = memo(NativeLocationPickerMap);
