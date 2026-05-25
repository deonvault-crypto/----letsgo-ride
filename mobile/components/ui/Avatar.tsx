import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { colors } from "../../constants/colors";

export function Avatar({ name = "LR", imageUri, size = 48 }: { name?: string; imageUri?: string; size?: number }) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  useEffect(() => {
    setFailedUri(null);
  }, [imageUri]);

  const validImageUri = imageUri && imageUri !== failedUri ? imageUri : undefined;

  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      {validImageUri ? (
        <Image source={{ uri: validImageUri }} style={[styles.image, { borderRadius: size / 2 }]} onError={() => setFailedUri(validImageUri)} />
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
    backgroundColor: "rgba(17,139,68,0.12)",
    borderWidth: 1,
    borderColor: "rgba(17,139,68,0.22)",
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
