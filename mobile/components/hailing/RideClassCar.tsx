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

export function RideClassCar({ rideClass, disabled = false }: RideClassCarProps) {
  return (
    <View
      testID={`ride-class-car-${rideClass.toLowerCase()}`}
      style={[styles.canvas, disabled && styles.disabled]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
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
  disabled: {
    opacity: 0.34,
  },
});
