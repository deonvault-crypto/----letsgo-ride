import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Animated, Image, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";

import { v2Theme } from "../../constants/v2Theme";

const landingPhoto = require("../../assets/images/food-landing-editorial-owned-v1.jpg");
const kitchenCover = require("../../assets/images/letsgoride-kitchen-cover-owned-v1.jpg");

export type FoodImageRole = "landing" | "restaurant" | "menu-item" | "neutral";

type Props = {
  uri?: string | null;
  logoUri?: string | null;
  role?: FoodImageRole;
  photographicFallback?: boolean;
  label?: string;
  style?: StyleProp<ViewStyle>;
};

export function FoodImage({ uri, logoUri, role, photographicFallback = false, label = "Food", style }: Props) {
  const [heroFailed, setHeroFailed] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [loading, setLoading] = useState(Boolean(uri || logoUri));
  const shimmer = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    setHeroFailed(false);
    setLogoFailed(false);
    setLoading(Boolean(uri || logoUri));
  }, [uri, logoUri]);

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
  const showRemoteHero = Boolean(uri && !heroFailed);
  const showRemoteLogo = !showRemoteHero && Boolean(logoUri && !logoFailed);
  const localSource = !showRemoteHero && !showRemoteLogo
    ? resolvedRole === "landing"
      ? landingPhoto
      : resolvedRole === "restaurant" && label.toLowerCase().includes("letsgoride kitchen")
        ? kitchenCover
        : null
    : null;
  const fallbackIcon = resolvedRole === "menu-item" ? "silverware-fork-knife" : "storefront-outline";
  const brand = restaurantBrand(label);

  return (
    <View accessibilityLabel={label} style={[styles.frame, style]} testID={`food-image-${resolvedRole}`}>
      {showRemoteHero ? (
        <Image
          source={{ uri: uri as string, cache: "force-cache" }}
          resizeMode="cover"
          style={styles.image}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onError={() => { setHeroFailed(true); setLoading(Boolean(logoUri && !logoFailed)); }}
        />
      ) : showRemoteLogo ? (
        <View style={[styles.logoPanel, { backgroundColor: brand.background }]}>
          <Image
            testID="food-image-restaurant-logo"
            source={{ uri: logoUri as string, cache: "force-cache" }}
            resizeMode="contain"
            style={styles.logoImage}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            onError={() => { setLogoFailed(true); setLoading(false); }}
          />
          <Text numberOfLines={1} style={[styles.logoCaption, { color: brand.text }]}>{label}</Text>
        </View>
      ) : localSource ? (
        <Image testID={resolvedRole === "landing" ? "food-image-landing-owned" : "food-image-kitchen-owned"} source={localSource} resizeMode="cover" style={styles.image} />
      ) : resolvedRole === "restaurant" ? (
        <View testID="food-image-neutral-fallback" style={[styles.brandFallback, { backgroundColor: brand.background }]}>
          <View style={[styles.brandMark, { backgroundColor: brand.accent }]}>
            <Text style={styles.brandMarkText}>{brandInitials(label)}</Text>
          </View>
          <Text numberOfLines={1} style={[styles.brandName, { color: brand.text }]}>{label}</Text>
        </View>
      ) : (
        <View testID="food-image-neutral-fallback" style={styles.neutralFallback}>
          <MaterialCommunityIcons name={fallbackIcon} size={31} color={v2Theme.colors.inkSecondary} />
          <Text numberOfLines={1} style={styles.fallbackText}>{label}</Text>
        </View>
      )}
      {loading ? <Animated.View testID="food-image-loading" pointerEvents="none" style={[styles.loading, { opacity: shimmer }]} /> : null}
    </View>
  );
}

function brandInitials(label: string) {
  const normalized = label.trim();
  if (/^kfc\b/i.test(normalized)) return "KFC";
  const words = normalized.replace(/[^A-Za-z0-9' ]/g, " ").split(/\s+/).filter(Boolean).filter((word) => !/^zimbabwe$/i.test(word));
  if (words.length === 0) return "LG";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

function restaurantBrand(label: string) {
  const value = label.toLowerCase();
  if (value.includes("kfc")) return { background: "#FFF0F0", accent: "#D71920", text: "#8E2025" };
  if (value.includes("chicken inn")) return { background: "#FFF3E8", accent: "#E16C24", text: "#8B431A" };
  if (value.includes("pizza inn")) return { background: "#FFF0EC", accent: "#D94D35", text: "#8A3325" };
  if (value.includes("baker's inn") || value.includes("bakers inn")) return { background: "#F8EFE4", accent: "#9A673F", text: "#68442B" };
  return { background: "#EEF7F0", accent: v2Theme.colors.brandStrong, text: v2Theme.colors.ink };
}

const styles = StyleSheet.create({
  frame: { overflow: "hidden", backgroundColor: v2Theme.colors.surfaceMuted },
  image: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  logoPanel: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 28, paddingVertical: 18 },
  logoImage: { width: "72%", height: "58%" },
  logoCaption: { maxWidth: "88%", fontSize: 10, fontWeight: "900", letterSpacing: 0.2 },
  brandFallback: { flex: 1, alignItems: "center", justifyContent: "center", gap: 9, paddingHorizontal: 18 },
  brandMark: { minWidth: 62, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 13 },
  brandMarkText: { color: "#FFFFFF", fontSize: 18, fontWeight: "900", letterSpacing: 0.8 },
  brandName: { maxWidth: "88%", fontSize: 11, fontWeight: "900", letterSpacing: 0.15 },
  neutralFallback: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: v2Theme.colors.surfaceMuted },
  fallbackText: { maxWidth: "78%", color: v2Theme.colors.inkSecondary, fontSize: 9, fontWeight: "800" },
  loading: { ...StyleSheet.absoluteFillObject, backgroundColor: v2Theme.colors.surface },
});
