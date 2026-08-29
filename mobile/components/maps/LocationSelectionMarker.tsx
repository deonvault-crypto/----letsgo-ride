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
 * A fixed precision marker anchored to the map camera center.
 *
 * The visual deliberately avoids the stock teardrop-pin silhouette. The black
 * locator puck, stem and anchor dot keep the exact coordinate unambiguous while
 * staying consistent with the Ride Now black-first visual language.
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
        <View style={styles.halo} />
        <View style={styles.puck} />
        <View testID="location-selection-marker-dot" style={styles.centerDot} />
        <View style={styles.stem} />
        <View style={styles.anchorDot} />
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
  halo: {
    position: "absolute",
    top: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(17,17,17,0.14)",
  },
  puck: {
    position: "absolute",
    top: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    backgroundColor: "#111111",
    shadowColor: v2Theme.colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  centerDot: {
    position: "absolute",
    top: 8.5,
    width: LOCATION_SELECTION_MARKER_METRICS.centerDotSize,
    height: LOCATION_SELECTION_MARKER_METRICS.centerDotSize,
    borderRadius: LOCATION_SELECTION_MARKER_METRICS.centerDotSize / 2,
    backgroundColor: "#FFFFFF",
  },
  stem: {
    position: "absolute",
    top: 20,
    width: 2,
    height: 8,
    borderRadius: 1,
    backgroundColor: "#111111",
  },
  anchorDot: {
    position: "absolute",
    bottom: 0,
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
    backgroundColor: "#111111",
    shadowColor: v2Theme.colors.shadow,
    shadowOpacity: 0.16,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
});
