import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StyleSheet, View } from "react-native";

import { HailingRideClass } from "../../types/hailing.types";

type RideClassCarProps = {
  rideClass: HailingRideClass;
  disabled?: boolean;
};

const classArt: Record<HailingRideClass, { icon: keyof typeof MaterialCommunityIcons.glyphMap; scale: number }> = {
  ECONOMY: { icon: "car-side", scale: 39 },
  COMFORT: { icon: "car-estate", scale: 40 },
  XL: { icon: "van-passenger", scale: 40 },
};

export function RideClassCar({ rideClass, disabled = false }: RideClassCarProps) {
  const art = classArt[rideClass];
  return (
    <View style={[styles.canvas, disabled && styles.disabled]}>
      <View style={styles.vehicleStage}>
        <MaterialCommunityIcons name={art.icon} size={art.scale} color="#111111" />
        <View style={styles.ground} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { width: 94, height: 52, alignItems: "center", justifyContent: "center" },
  disabled: { opacity: 0.42 },
  vehicleStage: {
    width: 86,
    height: 45,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.10)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  ground: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 7,
    height: 2,
    borderRadius: 1,
    backgroundColor: "rgba(17,17,17,0.10)",
  },
});
