import { StyleSheet, Text, View } from "react-native";

import { colors } from "../../constants/colors";

export function Avatar({ name = "LR" }: { name?: string }) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <View style={styles.avatar}>
      <Text style={styles.text}>{initials || "LR"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(29,185,84,0.18)",
    borderWidth: 1,
    borderColor: "rgba(105,240,174,0.35)",
  },
  text: {
    color: colors.whiteText,
    fontWeight: "900",
  },
});
