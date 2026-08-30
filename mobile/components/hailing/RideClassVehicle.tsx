import { StyleSheet, View } from "react-native";

import { v2Theme } from "../../constants/v2Theme";
import type { HailingRideClass } from "../../types/hailing.types";

type Props = {
  rideClass: HailingRideClass;
  compact?: boolean;
};

const classMeta: Record<HailingRideClass, { body: string; roof: string; scale: number }> = {
  ECONOMY: { body: "#F8FAF7", roof: "#DDE3DE", scale: 0.92 },
  COMFORT: { body: "#171A17", roof: "#2A302B", scale: 1 },
  XL: { body: "#F2F3F0", roof: "#CBD2CD", scale: 1.1 },
};

export function RideClassVehicle({ rideClass, compact = false }: Props) {
  const meta = classMeta[rideClass] || classMeta.ECONOMY;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.stage, { width: compact ? 72 : 92, height: compact ? 42 : 52, transform: [{ scale: meta.scale }] }]}
    >
      <View style={styles.shadow} />
      <View style={[styles.body, { backgroundColor: meta.body, borderColor: rideClass === "COMFORT" ? "#384139" : "#C9D2CB" }]}>
        <View style={[styles.hoodHighlight, rideClass === "COMFORT" && styles.darkHighlight]} />
        <View style={[styles.roof, { backgroundColor: meta.roof }]} />
        <View style={[styles.windshield, rideClass === "COMFORT" && styles.darkGlass]} />
        <View style={[styles.window, rideClass === "COMFORT" && styles.darkGlass]} />
        <View style={styles.greenAccent} />
      </View>
      <View style={[styles.wheel, styles.leftWheel]} />
      <View style={[styles.wheel, styles.rightWheel]} />
    </View>
  );
}

export function DriverMapMarker({ heading = 0 }: { heading?: number }) {
  return (
    <View
      accessibilityLabel="Assigned driver location"
      style={[styles.marker, { transform: [{ rotate: `${Number.isFinite(heading) ? heading : 0}deg` }] }]}
    >
      <View style={styles.markerNose} />
      <View style={styles.markerCabin} />
      <View style={styles.markerAccent} />
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { alignItems: "center", justifyContent: "center" },
  shadow: { position: "absolute", bottom: 4, width: "82%", height: 9, borderRadius: 999, backgroundColor: "rgba(10,17,13,0.16)" },
  body: { width: "86%", height: "56%", borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  hoodHighlight: { position: "absolute", left: 8, top: 5, width: "32%", height: 3, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.76)" },
  darkHighlight: { backgroundColor: "rgba(255,255,255,0.22)" },
  roof: { position: "absolute", left: "35%", top: 4, width: "28%", height: "62%", borderRadius: 10 },
  windshield: { position: "absolute", left: "23%", top: 7, width: "14%", height: "42%", borderRadius: 7, backgroundColor: "#AFC3B8" },
  window: { position: "absolute", right: "21%", top: 7, width: "15%", height: "42%", borderRadius: 7, backgroundColor: "#AFC3B8" },
  darkGlass: { backgroundColor: "#647268" },
  greenAccent: { position: "absolute", right: 8, bottom: 6, width: 16, height: 3, borderRadius: 999, backgroundColor: v2Theme.colors.brand },
  wheel: { position: "absolute", bottom: 7, width: 12, height: 12, borderRadius: 6, backgroundColor: "#101410", borderWidth: 2, borderColor: "#6F7A71" },
  leftWheel: { left: "22%" },
  rightWheel: { right: "22%" },
  marker: { width: 32, height: 44, alignItems: "center", justifyContent: "center" },
  markerNose: { width: 16, height: 22, borderTopLeftRadius: 10, borderTopRightRadius: 10, backgroundColor: "#111713" },
  markerCabin: { position: "absolute", top: 15, width: 20, height: 18, borderRadius: 8, backgroundColor: "#F7FAF6", borderWidth: StyleSheet.hairlineWidth, borderColor: "#C8D4CB" },
  markerAccent: { position: "absolute", top: 10, width: 4, height: 13, borderRadius: 999, backgroundColor: v2Theme.colors.brand },
});
