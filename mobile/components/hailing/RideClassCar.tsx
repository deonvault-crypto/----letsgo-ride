import { Image, ImageSourcePropType, StyleSheet, View } from "react-native";

import { HailingRideClass } from "../../types/hailing.types";

type RideClassCarProps = {
  rideClass: HailingRideClass;
  disabled?: boolean;
  selected?: boolean;
};

const vehicleAssets: Record<HailingRideClass, ImageSourcePropType> = {
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
        source={vehicleAssets[rideClass]}
        resizeMode="contain"
        fadeDuration={0}
        style={[styles.vehicle, rideClass === "XL" && styles.vehicleXl]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    width: 102,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "visible",
  },
  vehicle: {
    width: 108,
    height: 61,
  },
  vehicleXl: {
    width: 110,
    height: 63,
  },
  selectedGlow: {
    position: "absolute",
    left: 10,
    right: 10,
    top: 15,
    bottom: 9,
    borderRadius: 999,
    backgroundColor: "rgba(84,199,121,0.16)",
    shadowColor: "#54C779",
    shadowOpacity: 0.24,
    shadowRadius: 11,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  disabled: {
    opacity: 0.38,
  },
});
