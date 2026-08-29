import { StyleSheet, View } from "react-native";

import { HailingRideClass } from "../../types/hailing.types";

type RideClassCarProps = {
  rideClass: HailingRideClass;
  disabled?: boolean;
};

export function RideClassCar({ rideClass, disabled = false }: RideClassCarProps) {
  const comfort = rideClass === "COMFORT";
  const xl = rideClass === "XL";
  const bodyColor = xl ? "#202120" : comfort ? "#666B69" : "#AEB4B1";
  const highlight = xl ? "#353735" : comfort ? "#858B88" : "#CED2D0";

  return (
    <View style={[styles.canvas, disabled && styles.disabled]}>
      <View style={[styles.shadow, xl && styles.shadowXl]} />
      <View style={[styles.body, xl && styles.bodyXl, { backgroundColor: bodyColor }]}>
        <View style={[styles.bumper, { backgroundColor: highlight }]} />
        <View style={styles.headlight} />
      </View>
      <View style={[styles.cabin, comfort && styles.cabinComfort, xl && styles.cabinXl, { backgroundColor: bodyColor }]}>
        <View style={[styles.window, xl && styles.windowXl]} />
        <View style={[styles.window, styles.windowRear, xl && styles.windowRearXl]} />
      </View>
      <View style={[styles.wheel, styles.wheelFront]}><View style={styles.hub} /></View>
      <View style={[styles.wheel, styles.wheelRear]}><View style={styles.hub} /></View>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { width: 94, height: 48, position: "relative" },
  disabled: { opacity: 0.34 },
  shadow: { position: "absolute", left: 8, right: 6, bottom: 4, height: 6, borderRadius: 8, backgroundColor: "rgba(0,0,0,0.10)", transform: [{ scaleX: 0.92 }] },
  shadowXl: { left: 5, right: 3 },
  body: { position: "absolute", left: 5, right: 5, bottom: 11, height: 18, borderRadius: 9, borderTopRightRadius: 7 },
  bodyXl: { left: 2, right: 2, height: 20, borderRadius: 7 },
  cabin: { position: "absolute", left: 24, bottom: 25, width: 43, height: 16, borderTopLeftRadius: 10, borderTopRightRadius: 12, transform: [{ skewX: "-9deg" }] },
  cabinComfort: { left: 20, width: 48, height: 17 },
  cabinXl: { left: 17, width: 58, height: 21, borderTopLeftRadius: 8, borderTopRightRadius: 8, transform: [{ skewX: "-3deg" }] },
  window: { position: "absolute", left: 7, top: 3, width: 15, height: 10, borderRadius: 3, backgroundColor: "#DDE5E8" },
  windowRear: { left: 25, width: 13 },
  windowXl: { width: 20, height: 13, backgroundColor: "#C7D0D4" },
  windowRearXl: { left: 31, width: 19 },
  bumper: { position: "absolute", right: -2, bottom: 3, width: 8, height: 5, borderRadius: 3 },
  headlight: { position: "absolute", right: 4, top: 3, width: 5, height: 4, borderRadius: 2, backgroundColor: "#FFF4C7" },
  wheel: { position: "absolute", bottom: 5, width: 15, height: 15, borderRadius: 8, backgroundColor: "#171817", borderWidth: 2, borderColor: "#F3F3F3", alignItems: "center", justifyContent: "center" },
  wheelFront: { right: 13 },
  wheelRear: { left: 14 },
  hub: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#9DA29F" },
});
