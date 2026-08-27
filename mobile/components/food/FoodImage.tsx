import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Animated, Image, ImageSourcePropType, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";

import { v2Theme } from "../../constants/v2Theme";

const landingPhoto = require("../../assets/images/food-landing-editorial-owned-v1.jpg");
const kitchenCover = require("../../assets/images/letsgoride-kitchen-cover-owned-v1.jpg");

export type FoodImageRole = "landing" | "restaurant" | "logo" | "menu-item" | "neutral";

type Props = {
  uri?: string | null;
  source?: ImageSourcePropType;
  role?: FoodImageRole;
  photographicFallback?: boolean;
  label?: string;
  style?: StyleProp<ViewStyle>;
};

export function FoodImage({ uri, source, role, photographicFallback = false, label = "Food", style }: Props) {
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

  const resolvedRole: FoodImageRole = role || (photographicFallback && label.toLowerCase().includes("letsgoride kitchen") ? "restaurant" : "neutral");
  const showRemote = Boolean(uri && !failed);
  const localSource = !showRemote
    ? source || (resolvedRole === "landing"
      ? landingPhoto
      : resolvedRole === "restaurant" && label.toLowerCase().includes("letsgoride kitchen")
        ? kitchenCover
        : null)
    : null;
  const fallbackIcon = resolvedRole === "menu-item" ? "silverware-fork-knife" : "storefront-outline";
  const resizeMode = resolvedRole === "logo" ? "contain" : "cover";

  return (
    <View accessibilityLabel={label} style={[styles.frame, style]} testID={`food-image-${resolvedRole}`}>
      {showRemote ? (
        <Image
          testID={resolvedRole === "logo" ? "food-image-remote-logo" : "food-image-remote-photo"}
          source={{ uri: uri as string, cache: "force-cache" }}
          resizeMode={resizeMode}
          resizeMethod="resize"
          style={[styles.image, resolvedRole === "logo" && styles.logoImage]}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onError={() => { setFailed(true); setLoading(false); }}
        />
      ) : localSource ? (
        <Image
          testID={resolvedRole === "landing" ? "food-image-landing-owned" : resolvedRole === "logo" ? "food-image-official-logo" : "food-image-kitchen-owned"}
          source={localSource}
          resizeMode={resizeMode}
          resizeMethod="resize"
          style={[styles.image, resolvedRole === "logo" && styles.logoImage]}
        />
      ) : (
        <View testID="food-image-neutral-fallback" style={styles.neutralFallback}>
          <MaterialCommunityIcons name={fallbackIcon} size={31} color={v2Theme.colors.inkSecondary} />
          {resolvedRole !== "logo" ? <Text numberOfLines={1} style={styles.fallbackText}>{label}</Text> : null}
        </View>
      )}
      {loading ? <Animated.View testID="food-image-loading" style={[styles.loading, { opacity: shimmer }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: "hidden", backgroundColor: v2Theme.colors.surfaceMuted },
  image: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  logoImage: { top: 12, right: 10, bottom: 12, left: 10, width: undefined, height: undefined },
  neutralFallback: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: v2Theme.colors.surfaceMuted },
  fallbackText: { maxWidth: "78%", color: v2Theme.colors.inkSecondary, fontSize: 9, fontWeight: "800" },
  loading: { ...StyleSheet.absoluteFillObject, backgroundColor: v2Theme.colors.surface },
});
