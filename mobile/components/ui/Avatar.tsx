import { Image, StyleSheet, Text, View } from "react-native";

import { colors } from "../../constants/colors";

export function Avatar({ name = "LR", imageUri, size = 48 }: { name?: string; imageUri?: string; size?: number }) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={[styles.image, { borderRadius: size / 2 }]} />
      ) : (
        <Text style={styles.text}>{initials || "LR"}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(29,185,84,0.18)",
    borderWidth: 1,
    borderColor: "rgba(105,240,174,0.35)",
    overflow: "hidden",
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  text: {
    color: colors.primaryGreen,
    fontWeight: "900",
  },
});
