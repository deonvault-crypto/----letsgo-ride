import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View } from "react-native";

import { HailingRideClass } from "../../types/hailing.types";

type RideClassCarProps = {
  rideClass: HailingRideClass;
  disabled?: boolean;
};

type VehicleProfile = {
  bodyWidth: number;
  bodyHeight: number;
  bodyLeft: number;
  cabinWidth: number;
  cabinHeight: number;
  cabinLeft: number;
  cabinBottom: number;
  frontWheelLeft: number;
  rearWheelLeft: number;
  windowSplit: number;
  roofRadius: number;
};

const profiles: Record<HailingRideClass, VehicleProfile> = {
  ECONOMY: {
    bodyWidth: 74,
    bodyHeight: 17,
    bodyLeft: 11,
    cabinWidth: 42,
    cabinHeight: 17,
    cabinLeft: 28,
    cabinBottom: 23,
    frontWheelLeft: 65,
    rearWheelLeft: 20,
    windowSplit: 19,
    roofRadius: 10,
  },
  COMFORT: {
    bodyWidth: 82,
    bodyHeight: 18,
    bodyLeft: 7,
    cabinWidth: 47,
    cabinHeight: 18,
    cabinLeft: 25,
    cabinBottom: 24,
    frontWheelLeft: 68,
    rearWheelLeft: 18,
    windowSplit: 22,
    roofRadius: 11,
  },
  XL: {
    bodyWidth: 86,
    bodyHeight: 20,
    bodyLeft: 5,
    cabinWidth: 59,
    cabinHeight: 22,
    cabinLeft: 19,
    cabinBottom: 25,
    frontWheelLeft: 70,
    rearWheelLeft: 16,
    windowSplit: 28,
    roofRadius: 9,
  },
};

export function RideClassCar({ rideClass, disabled = false }: RideClassCarProps) {
  const profile = profiles[rideClass];
  return (
    <View
      testID={`ride-class-car-${rideClass.toLowerCase()}`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.canvas, disabled && styles.disabled]}
    >
      <View style={styles.stage}>
        <View style={styles.groundShadow} />

        <LinearGradient
          colors={["#070707", "#242526", "#0C0C0D", "#353638"]}
          locations={[0, 0.28, 0.66, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.body,
            {
              width: profile.bodyWidth,
              height: profile.bodyHeight,
              left: profile.bodyLeft,
            },
          ]}
        >
          <View style={styles.bodyHighlight} />
          <View style={styles.lowerSill} />
          <View style={styles.frontLight} />
          <View style={styles.rearLight} />
        </LinearGradient>

        <LinearGradient
          colors={["#151718", "#363B3F", "#101112"]}
          locations={[0, 0.48, 1]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={[
            styles.cabin,
            {
              width: profile.cabinWidth,
              height: profile.cabinHeight,
              left: profile.cabinLeft,
              bottom: profile.cabinBottom,
              borderTopLeftRadius: profile.roofRadius,
              borderTopRightRadius: profile.roofRadius,
            },
          ]}
        >
          <LinearGradient
            colors={["#BFCAD1", "#70808A", "#3A464E"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.windowGlass}
          >
            <View style={[styles.windowDivider, { left: profile.windowSplit }]} />
            <View style={styles.glassReflection} />
          </LinearGradient>
        </LinearGradient>

        <View style={[styles.wheel, { left: profile.rearWheelLeft }]}>
          <LinearGradient colors={["#080808", "#272727", "#050505"]} style={styles.tyre}>
            <View style={styles.rim}><View style={styles.hub} /></View>
          </LinearGradient>
        </View>
        <View style={[styles.wheel, { left: profile.frontWheelLeft }]}>
          <LinearGradient colors={["#080808", "#272727", "#050505"]} style={styles.tyre}>
            <View style={styles.rim}><View style={styles.hub} /></View>
          </LinearGradient>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    width: 104,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.38 },
  stage: {
    width: 96,
    height: 52,
    position: "relative",
  },
  groundShadow: {
    position: "absolute",
    left: 13,
    right: 5,
    bottom: 3,
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.12)",
    transform: [{ scaleY: 0.5 }],
  },
  body: {
    position: "absolute",
    bottom: 10,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 11,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 7,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)",
    shadowColor: "#000000",
    shadowOpacity: 0.2,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  bodyHighlight: {
    position: "absolute",
    left: 7,
    right: 8,
    top: 2,
    height: 1,
    borderRadius: 1,
    backgroundColor: "rgba(255,255,255,0.34)",
  },
  lowerSill: {
    position: "absolute",
    left: 13,
    right: 12,
    bottom: 2,
    height: 2,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  frontLight: {
    position: "absolute",
    right: 1,
    top: 4,
    width: 5,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#F6F1D2",
    opacity: 0.95,
  },
  rearLight: {
    position: "absolute",
    left: 1,
    top: 5,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#A72727",
    opacity: 0.9,
  },
  cabin: {
    position: "absolute",
    overflow: "hidden",
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.16)",
    transform: [{ skewX: "-5deg" }],
  },
  windowGlass: {
    flex: 1,
    marginHorizontal: 4,
    marginTop: 3,
    marginBottom: 3,
    borderRadius: 5,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.24)",
  },
  windowDivider: {
    position: "absolute",
    top: -1,
    bottom: -1,
    width: 2,
    backgroundColor: "#17191A",
    opacity: 0.85,
  },
  glassReflection: {
    position: "absolute",
    width: 21,
    height: 2,
    top: 3,
    left: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.30)",
    transform: [{ rotate: "-9deg" }],
  },
  wheel: {
    position: "absolute",
    bottom: 4,
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: "#050505",
    alignItems: "center",
    justifyContent: "center",
  },
  tyre: {
    width: 15,
    height: 15,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  rim: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#9A9D9F",
    borderWidth: 1,
    borderColor: "#D9DADB",
    alignItems: "center",
    justifyContent: "center",
  },
  hub: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#333536",
  },
});
