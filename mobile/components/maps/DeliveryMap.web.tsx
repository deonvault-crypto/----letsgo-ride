import { StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { v2Theme } from "../../constants/v2Theme";

type Point = { latitude?: number | null; longitude?: number | null };
type DeliveryMapProps = {
  pickup?: Point | null;
  dropoff?: Point | null;
  courier?: Point | null;
  route?: Array<{ latitude: number; longitude: number }>;
  courierHeading?: number | null;
  height?: number;
};

export function DeliveryMap({ courier, route = [], height = 340 }: DeliveryMapProps) {
  return (
    <View style={[styles.frame, { height }]}>
      <View style={styles.routeOne} />
      <View style={styles.routeTwo} />
      <View style={styles.marker}><MaterialCommunityIcons name={courier ? "motorbike" : "map-marker-path"} size={24} color="#FFFFFF" /></View>
      <Text style={styles.title}>{courier ? "Courier location connected" : "Live route map"}</Text>
      <Text style={styles.body}>{route.length > 1 ? "The current road route is available in the native app." : "Open the iOS or Android app for the interactive route and live markers."}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: v2Theme.radius.xxl, backgroundColor: v2Theme.colors.brandSofter, alignItems: "center", justifyContent: "center", overflow: "hidden", gap: 7, padding: 24 },
  routeOne: { position: "absolute", width: "88%", height: 120, borderWidth: 5, borderColor: "rgba(20,157,72,0.16)", borderRadius: 120, transform: [{ rotate: "18deg" }] },
  routeTwo: { position: "absolute", width: "72%", height: 86, borderWidth: 2, borderColor: "rgba(17,21,18,0.10)", borderRadius: 100, transform: [{ rotate: "-24deg" }] },
  marker: { width: 50, height: 50, borderRadius: 18, backgroundColor: v2Theme.colors.brand, alignItems: "center", justifyContent: "center" },
  title: { color: v2Theme.colors.ink, fontSize: 17, fontWeight: "900" },
  body: { maxWidth: 320, color: v2Theme.colors.inkSecondary, fontSize: 11, lineHeight: 16, textAlign: "center" },
});
