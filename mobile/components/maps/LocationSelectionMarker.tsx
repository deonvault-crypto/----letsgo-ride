import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";

import { v2Theme } from "../../constants/v2Theme";

export const LOCATION_SELECTION_MARKER_METRICS = {
  anchor: { x: 0.5, y: 1 } as const,
  touchSize: v2Theme.control.minTouch,
  visualWidth: 22,
  visualHeight: 32,
  centerDotSize: 5,
} as const;

type LocationSelectionMarkerProps = {
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * The fixed picker marker is anchored by its bottom tip to the map camera center.
 * Its 44 px frame preserves a native-sized accessibility target independently of
 * the deliberately compact 22 x 32 px visual.
 */
export function LocationSelectionMarker({ accessibilityLabel, style }: LocationSelectionMarkerProps) {
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
      pointerEvents="none"
      testID="location-selection-marker"
      style={[styles.anchorFrame, style]}
    >
      <View testID="location-selection-marker-visual" style={styles.visual}>
        <View style={styles.tailOutline} />
        <View style={styles.tailFill} />
        <View style={styles.headOutline} />
        <View style={styles.headFill} />
        <View testID="location-selection-marker-dot" style={styles.centerDot} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  anchorFrame: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: LOCATION_SELECTION_MARKER_METRICS.touchSize,
    height: LOCATION_SELECTION_MARKER_METRICS.touchSize,
    marginLeft: -(LOCATION_SELECTION_MARKER_METRICS.touchSize / 2),
    marginTop: -LOCATION_SELECTION_MARKER_METRICS.touchSize,
    alignItems: "center",
    justifyContent: "flex-end",
    zIndex: 3,
  },
  visual: {
    width: LOCATION_SELECTION_MARKER_METRICS.visualWidth,
    height: LOCATION_SELECTION_MARKER_METRICS.visualHeight,
    alignItems: "center",
  },
  tailOutline: {
    position: "absolute",
    left: 5,
    top: 17.5,
    width: 12,
    height: 12,
    borderBottomRightRadius: 2,
    backgroundColor: "#075C2A",
    transform: [{ rotate: "45deg" }],
  },
  tailFill: {
    position: "absolute",
    left: 6,
    top: 18.5,
    width: 10,
    height: 10,
    borderBottomRightRadius: 1.5,
    backgroundColor: v2Theme.colors.brand,
    transform: [{ rotate: "45deg" }],
  },
  headOutline: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#075C2A",
    shadowColor: v2Theme.colors.shadow,
    shadowOpacity: 0.16,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  headFill: {
    position: "absolute",
    left: 1,
    top: 1,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: v2Theme.colors.brand,
  },
  centerDot: {
    position: "absolute",
    left: 8.5,
    top: 8.5,
    width: LOCATION_SELECTION_MARKER_METRICS.centerDotSize,
    height: LOCATION_SELECTION_MARKER_METRICS.centerDotSize,
    borderRadius: LOCATION_SELECTION_MARKER_METRICS.centerDotSize / 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(7,92,42,0.28)",
    backgroundColor: "#FFFFFF",
  },
});
