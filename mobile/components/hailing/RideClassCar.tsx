import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View } from "react-native";

import { HailingRideClass } from "../../types/hailing.types";

type RideClassCarProps = {
  rideClass: HailingRideClass;
  disabled?: boolean;
};

type VehicleGeometry = {
  bodyWidth: number;
  bodyLeft: number;
  bodyBottom: number;
  bodyHeight: number;
  roofWidth: number;
  roofLeft: number;
  roofBottom: number;
  roofHeight: number;
  rearWheelLeft: number;
  frontWheelLeft: number;
  windowLeft: number;
  windowWidth: number;
  windowHeight: number;
};

const geometry: Record<HailingRideClass, VehicleGeometry> = {
  ECONOMY: {
    bodyWidth: 82,
    bodyLeft: 9,
    bodyBottom: 12,
    bodyHeight: 22,
    roofWidth: 46,
    roofLeft: 27,
    roofBottom: 30,
    roofHeight: 18,
    rearWheelLeft: 20,
    frontWheelLeft: 69,
    windowLeft: 31,
    windowWidth: 38,
    windowHeight: 12,
  },
  COMFORT: {
    bodyWidth: 88,
    bodyLeft: 6,
    bodyBottom: 12,
    bodyHeight: 21,
    roofWidth: 53,
    roofLeft: 24,
    roofBottom: 29,
    roofHeight: 20,
    rearWheelLeft: 18,
    frontWheelLeft: 70,
    windowLeft: 29,
    windowWidth: 43,
    windowHeight: 13,
  },
  XL: {
    bodyWidth: 91,
    bodyLeft: 4,
    bodyBottom: 11,
    bodyHeight: 25,
    roofWidth: 65,
    roofLeft: 16,
    roofBottom: 32,
    roofHeight: 21,
    rearWheelLeft: 17,
    frontWheelLeft: 72,
    windowLeft: 21,
    windowWidth: 55,
    windowHeight: 14,
  },
};

function Wheel({ left }: { left: number }) {
  return (
    <View style={[styles.wheel, { left }]}>
      <LinearGradient colors={["#6F7479", "#2B2E31"]} style={styles.rim}>
        <View style={styles.hub} />
      </LinearGradient>
    </View>
  );
}

export function RideClassCar({ rideClass, disabled = false }: RideClassCarProps) {
  const car = geometry[rideClass];
  const isXl = rideClass === "XL";
  const isComfort = rideClass === "COMFORT";

  return (
    <View
      testID={`ride-class-car-${rideClass.toLowerCase()}`}
      style={[styles.canvas, disabled && styles.disabled]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.shadow} />

      <LinearGradient
        colors={isComfort ? ["#363A3F", "#111315"] : isXl ? ["#25292D", "#090A0B"] : ["#4A4F53", "#17191B"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.body,
          {
            width: car.bodyWidth,
            left: car.bodyLeft,
            bottom: car.bodyBottom,
            height: car.bodyHeight,
          },
        ]}
      >
        <View style={styles.beltLine} />
        <View style={styles.rearLamp} />
        <View style={styles.headLamp} />
        <View style={styles.doorHandleRear} />
        <View style={styles.doorHandleFront} />
      </LinearGradient>

      <LinearGradient
        colors={isComfort ? ["#444A50", "#171A1D"] : isXl ? ["#343A40", "#131517"] : ["#585E63", "#1D2023"]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={[
          styles.roof,
          {
            width: car.roofWidth,
            left: car.roofLeft,
            bottom: car.roofBottom,
            height: car.roofHeight,
            borderTopLeftRadius: isXl ? 7 : 13,
            borderTopRightRadius: isXl ? 7 : 15,
          },
        ]}
      />

      <LinearGradient
        colors={["#C9D6DC", "#6F808A"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.windows,
          {
            left: car.windowLeft,
            width: car.windowWidth,
            height: car.windowHeight,
            bottom: car.roofBottom + 3,
          },
        ]}
      >
        <View style={[styles.windowDivider, isXl && styles.windowDividerXl]} />
      </LinearGradient>

      <View style={[styles.lowerTrim, { left: car.bodyLeft + 8, width: car.bodyWidth - 16, bottom: car.bodyBottom + 5 }]} />
      <View style={[styles.frontFascia, { left: car.bodyLeft + car.bodyWidth - 13, bottom: car.bodyBottom + 4 }]}><View style={styles.grille} /></View>
      <View style={[styles.rearBumper, { left: car.bodyLeft + 1, bottom: car.bodyBottom + 3 }]} />
      <View style={[styles.mirror, styles.mirrorRear, { left: car.roofLeft - 4, bottom: car.roofBottom + 4 }]} />
      <View style={[styles.mirror, styles.mirrorFront, { left: car.roofLeft + car.roofWidth - 1, bottom: car.roofBottom + 4 }]} />
      {isComfort ? <View style={[styles.chromeLine, { left: car.bodyLeft + 13, width: car.bodyWidth - 27, bottom: car.bodyBottom + 8 }]} /> : null}
      {isXl ? <><View style={[styles.roofRail, { left: car.roofLeft + 6, width: car.roofWidth - 12, bottom: car.roofBottom + car.roofHeight + 1 }]} /><View style={[styles.xlQuarterGlass, { left: car.windowLeft + 3, bottom: car.roofBottom + 5 }]} /></> : null}
      <View style={[styles.brandAccent, { left: car.bodyLeft + car.bodyWidth - 22, bottom: car.bodyBottom + 7 }]} />
      <Wheel left={car.rearWheelLeft} />
      <Wheel left={car.frontWheelLeft} />
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    width: 100,
    height: 58,
    position: "relative",
  },
  disabled: {
    opacity: 0.36,
  },
  shadow: {
    position: "absolute",
    left: 13,
    right: 6,
    bottom: 5,
    height: 9,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.13)",
    transform: [{ scaleY: 0.52 }],
  },
  body: {
    position: "absolute",
    borderTopLeftRadius: 11,
    borderTopRightRadius: 15,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)",
    overflow: "hidden",
  },
  roof: {
    position: "absolute",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.16)",
  },
  windows: {
    position: "absolute",
    borderTopLeftRadius: 8,
    borderTopRightRadius: 10,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.42)",
    overflow: "hidden",
  },
  windowDivider: {
    position: "absolute",
    left: "51%",
    top: -2,
    bottom: -2,
    width: 2,
    backgroundColor: "rgba(17,19,21,0.88)",
    transform: [{ rotate: "-4deg" }],
  },
  windowDividerXl: {
    left: "58%",
  },
  beltLine: {
    position: "absolute",
    left: 9,
    right: 8,
    top: 9,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.26)",
  },
  lowerTrim: {
    position: "absolute",
    height: 2,
    borderRadius: 1,
    backgroundColor: "rgba(255,255,255,0.17)",
  },
  rearLamp: {
    position: "absolute",
    left: 2,
    top: 5,
    width: 5,
    height: 5,
    borderRadius: 2,
    backgroundColor: "#B72B31",
  },
  headLamp: {
    position: "absolute",
    right: 2,
    top: 5,
    width: 7,
    height: 5,
    borderRadius: 2,
    backgroundColor: "#EEF4F6",
  },
  doorHandleRear: {
    position: "absolute",
    left: "48%",
    top: 7,
    width: 8,
    height: 2,
    borderRadius: 1,
    backgroundColor: "rgba(212,216,219,0.55)",
  },
  doorHandleFront: {
    position: "absolute",
    right: 18,
    top: 7,
    width: 8,
    height: 2,
    borderRadius: 1,
    backgroundColor: "rgba(212,216,219,0.55)",
  },
  frontFascia: { position: "absolute", width: 12, height: 12, borderTopRightRadius: 7, borderBottomRightRadius: 6, backgroundColor: "rgba(7,8,9,0.72)", borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: "rgba(255,255,255,0.18)", justifyContent: "center", alignItems: "center" },
  grille: { width: 7, height: 5, borderRadius: 2, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(218,223,226,0.55)", backgroundColor: "rgba(0,0,0,0.42)" },
  rearBumper: { position: "absolute", width: 8, height: 4, borderRadius: 2, backgroundColor: "rgba(9,10,11,0.75)" },
  mirror: { position: "absolute", width: 8, height: 4, borderRadius: 3, backgroundColor: "#25292D", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.2)" },
  mirrorRear: { transform: [{ rotate: "-9deg" }] },
  mirrorFront: { transform: [{ rotate: "8deg" }] },
  chromeLine: { position: "absolute", height: StyleSheet.hairlineWidth, backgroundColor: "rgba(225,230,233,0.62)" },
  roofRail: { position: "absolute", height: 2, borderRadius: 2, backgroundColor: "rgba(205,211,215,0.46)" },
  xlQuarterGlass: { position: "absolute", width: 11, height: 8, borderRadius: 3, backgroundColor: "rgba(130,151,162,0.7)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.38)" },
  brandAccent: { position: "absolute", width: 7, height: 2, borderRadius: 2, backgroundColor: "#54C779", opacity: 0.72 },
  wheel: {
    position: "absolute",
    bottom: 3,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#050607",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  rim: {
    width: 13,
    height: 13,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  hub: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D5D9DC",
  },
});
