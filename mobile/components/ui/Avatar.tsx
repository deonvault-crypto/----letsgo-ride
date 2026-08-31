import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { colors } from "../../constants/colors";

export function Avatar({
  name = "LR",
  imageUri,
  size = 48,
  tone = "brand",
}: {
  name?: string;
  imageUri?: string;
  size?: number;
  tone?: "brand" | "neutral";
}) {
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
  const neutral = tone === "neutral";

  return (
    <View
      style={[
        styles.avatar,
        neutral && styles.avatarNeutral,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      {validImageUri ? (
        <Image source={{ uri: validImageUri }} style={[styles.image, { borderRadius: size / 2 }]} onError={() => setFailedUri(validImageUri)} />
      ) : (
        <Text style={[styles.text, neutral && styles.textNeutral]}>{initials || "LR"}</Text>
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
  avatarNeutral: {
    backgroundColor: "rgba(17,17,17,0.06)",
    borderColor: "rgba(17,17,17,0.14)",
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
  textNeutral: {
    color: colors.charcoal,
  },
});
