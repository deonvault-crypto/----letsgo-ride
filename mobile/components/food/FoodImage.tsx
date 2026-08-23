import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Animated, Image, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";

import { v2Theme } from "../../constants/v2Theme";

const ownedFoodPhoto = require("../../assets/images/food-marketplace-owned-v1.png");

type Props = {
  uri?: string | null;
  photographicFallback?: boolean;
  label?: string;
  style?: StyleProp<ViewStyle>;
};

export function FoodImage({ uri, photographicFallback = false, label = "Food" , style }: Props) {
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(Boolean(uri));
  const shimmer = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    setFailed(false);
    setLoading(Boolean(uri));
  }, [uri]);

  useEffect(() => {
    if (!loading) return;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(shimmer, { toValue: 0.8, duration: 650, useNativeDriver: true }),
      Animated.timing(shimmer, { toValue: 0.35, duration: 650, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [loading, shimmer]);

  const showRemote = Boolean(uri && !failed);
  const showPhotoFallback = !showRemote && photographicFallback;

  return (
    <View accessibilityLabel={label} style={[styles.frame, style]}>
      {showRemote ? (
        <Image
          source={{ uri: uri as string, cache: "force-cache" }}
          resizeMode="cover"
          style={StyleSheet.absoluteFill}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onError={() => { setFailed(true); setLoading(false); }}
        />
      ) : showPhotoFallback ? (
        <Image testID="food-image-owned-fallback" source={ownedFoodPhoto} resizeMode="cover" style={StyleSheet.absoluteFill} />
      ) : (
        <View testID="food-image-neutral-fallback" style={styles.neutralFallback}>
          <MaterialCommunityIcons name="storefront-outline" size={31} color={v2Theme.colors.inkSecondary} />
          <Text numberOfLines={1} style={styles.fallbackText}>{label}</Text>
        </View>
      )}
      {loading ? <Animated.View testID="food-image-loading" style={[styles.loading, { opacity: shimmer }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: "hidden", backgroundColor: v2Theme.colors.surfaceMuted },
  neutralFallback: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: v2Theme.colors.surfaceMuted },
  fallbackText: { maxWidth: "78%", color: v2Theme.colors.inkSecondary, fontSize: 9, fontWeight: "800" },
  loading: { ...StyleSheet.absoluteFillObject, backgroundColor: v2Theme.colors.surface },
});
