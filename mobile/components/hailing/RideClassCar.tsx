import { Image, StyleSheet, View } from "react-native";

import { HailingRideClass } from "../../types/hailing.types";

type RideClassCarProps = {
  rideClass: HailingRideClass;
  disabled?: boolean;
  selected?: boolean;
};

const VEHICLE_IMAGES: Record<HailingRideClass, number> = {
  ECONOMY: require("../../assets/images/hailing/ride-economy.png"),
  COMFORT: require("../../assets/images/hailing/ride-comfort.png"),
  XL: require("../../assets/images/hailing/ride-xl.png"),
};

export function RideClassCar({ rideClass, disabled = false, selected = false }: RideClassCarProps) {
  return (
    <View
      testID={`ride-class-car-${rideClass.toLowerCase()}`}
      style={[styles.canvas, disabled && styles.disabled]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {selected ? <View pointerEvents="none" style={styles.selectedGlow} /> : null}
      <Image
        source={VEHICLE_IMAGES[rideClass]}
        resizeMode="contain"
        fadeDuration={0}
        style={styles.vehicleImage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    width: 106,
    height: 68,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  vehicleImage: {
    width: 106,
    height: 64,
    zIndex: 2,
  },
  selectedGlow: {
    position: "absolute",
    width: 82,
    height: 34,
    top: 20,
    borderRadius: 999,
    backgroundColor: "rgba(84,199,121,0.14)",
    shadowColor: "#54C779",
    shadowOpacity: 0.32,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
    zIndex: 1,
  },
  disabled: {
    opacity: 0.34,
  },
});
