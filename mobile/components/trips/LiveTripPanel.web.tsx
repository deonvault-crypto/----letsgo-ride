import { StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { Ride } from "../../types/ride.types";
import { canonicalRideStatus } from "../../utils/tripLifecycle";

type LiveTripPanelProps = { ride: Ride; role: "driver" | "passenger"; onRideMutation?: (ride: Ride) => void };

export function LiveTripPanel({ ride, role }: LiveTripPanelProps) {
  const active = canonicalRideStatus(ride.status) === "IN_PROGRESS" || ride.legacy_status === "departed";
  return (
    <View style={styles.card}>
      <View style={styles.icon}><MaterialCommunityIcons name="map-marker-path" size={25} color={colors.primaryGreen} /></View>
      <Text style={styles.title}>{active ? "Live trip connected" : "Live trip"}</Text>
      <Text style={styles.body}>{active ? `${role === "driver" ? "Location sharing" : "Driver tracking"} is available in the iOS or Android app.` : "Live progress becomes available after the trip starts."}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 24, padding: spacing.lg, gap: spacing.sm, alignItems: "center" },
  icon: { width: 52, height: 52, borderRadius: 18, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  title: { color: colors.whiteText, fontSize: 18, fontWeight: "900" },
  body: { color: colors.mutedText, lineHeight: 21, textAlign: "center" },
});
