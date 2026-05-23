import { StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { Avatar } from "../ui/Avatar";
import { StatusBadge } from "../ui/StatusBadge";

export function DriverCard({
  name,
  rating,
  vehicle,
  verified = true,
}: {
  name: string;
  rating?: number;
  vehicle?: string;
  verified?: boolean;
}) {
  return (
    <View style={styles.card}>
      <Avatar name={name} />
      <View style={styles.body}>
        <Text style={styles.name}>{name}</Text>
        <View style={styles.row}>
          <MaterialCommunityIcons name="star" size={16} color={colors.warning} />
          <Text style={styles.meta}>{rating ? rating.toFixed(1) : "New driver"}</Text>
        </View>
        {vehicle ? <Text style={styles.meta}>{vehicle}</Text> : null}
      </View>
      {verified ? <StatusBadge label="Verified" tone="success" /> : <StatusBadge label="Pending" tone="warning" />}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: spacing.lg,
  },
  body: {
    flex: 1,
    gap: 3,
  },
  name: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  meta: {
    color: colors.mutedText,
    fontSize: 13,
  },
});
