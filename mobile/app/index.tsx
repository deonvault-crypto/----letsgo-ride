import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { Screen } from "../components/ui/Screen";
import { getCurrentUser, hasSession, logout } from "../services/authService";

const MIN_LAUNCH_MS = 460;

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export default function IndexScreen() {
  const router = useRouter();
  const entrance = useRef(new Animated.Value(0)).current;
  const serviceReveal = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(entrance, {
        toValue: 1,
        damping: 18,
        stiffness: 170,
        mass: 0.85,
        useNativeDriver: true,
      }),
      Animated.timing(serviceReveal, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();

    let active = true;

    async function decideRoute() {
      const startedAt = Date.now();
      const session = await hasSession();
      let destination = "/(customer)/home";

      if (session) {
        try {
          const user = await getCurrentUser();
          if (user.role === "admin") destination = "/(admin)/dashboard";
          else if (user.role === "driver") destination = "/(driver)/home";
          else if (user.role === "courier") destination = "/(courier)/home";
          else if (user.role === "merchant") destination = "/(merchant)/home";
        } catch {
          await logout();
          destination = "/(customer)/home";
        }
      }

      const remaining = Math.max(0, MIN_LAUNCH_MS - (Date.now() - startedAt));
      if (remaining > 0) await wait(remaining);
      if (active) router.replace(destination as never);
    }

    decideRoute();
    return () => {
      active = false;
    };
  }, [entrance, router, serviceReveal]);

  const brandStyle = {
    opacity: entrance,
    transform: [
      { scale: entrance.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
      { translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
    ],
  };

  return (
    <Screen showHeader={false} scroll={false}>
      <LinearGradient
        colors={["#F8F5EE", "#EFF7F1", "#E4F1E8"]}
        start={{ x: 0.05, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.launch}
      >
        <Animated.View style={[styles.brandBlock, brandStyle]}>
          <View style={styles.markWrap}>
            <LinearGradient colors={["#123F2A", "#2F9A58"]} style={styles.mark}>
              <MaterialCommunityIcons name="navigation-variant" size={31} color="#FFFFFF" />
            </LinearGradient>
            <View style={styles.markOrbit} />
          </View>
          <Text style={styles.wordmark}>Lets<Text style={styles.wordmarkGo}>Go</Text>Ride</Text>
          <Text style={styles.tagline}>Move people. Move food. Move anything.</Text>
        </Animated.View>

        <Animated.View style={[styles.services, { opacity: serviceReveal, transform: [{ translateY: serviceReveal.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>
          <ServiceGlyph icon="car-outline" label="Ride" />
          <View style={styles.serviceDivider} />
          <ServiceGlyph icon="food-fork-drink" label="Food" />
          <View style={styles.serviceDivider} />
          <ServiceGlyph icon="package-variant-closed" label="Courier" />
        </Animated.View>

        <View style={styles.launchFooter}>
          <View style={styles.loadingTrack}><Animated.View style={[styles.loadingFill, { opacity: entrance }]} /></View>
          <Text style={styles.loadingText}>Getting your experience ready</Text>
        </View>
      </LinearGradient>
    </Screen>
  );
}

function ServiceGlyph({ icon, label }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string }) {
  return (
    <View style={styles.serviceItem}>
      <View style={styles.serviceIcon}><MaterialCommunityIcons name={icon} size={20} color="#1B5E36" /></View>
      <Text style={styles.serviceLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  launch: { flex: 1, borderRadius: 30, paddingHorizontal: 24, paddingVertical: 32, justifyContent: "center", overflow: "hidden" },
  brandBlock: { alignItems: "center", gap: 10 },
  markWrap: { width: 92, height: 92, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  mark: { width: 72, height: 72, borderRadius: 25, alignItems: "center", justifyContent: "center", shadowColor: "#123F2A", shadowOpacity: 0.22, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  markOrbit: { position: "absolute", width: 90, height: 90, borderRadius: 45, borderWidth: 1, borderColor: "rgba(47,154,88,0.2)" },
  wordmark: { color: "#121713", fontSize: 38, fontWeight: "900", letterSpacing: -1.7 },
  wordmarkGo: { color: "#25844B" },
  tagline: { color: "#5B675F", fontSize: 12, fontWeight: "700", letterSpacing: 0.1 },
  services: { marginTop: 34, minHeight: 78, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.72)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(20,70,43,0.12)", flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  serviceItem: { flex: 1, alignItems: "center", gap: 6 },
  serviceIcon: { width: 38, height: 38, borderRadius: 14, backgroundColor: "#E7F5EB", alignItems: "center", justifyContent: "center" },
  serviceLabel: { color: "#26342B", fontSize: 9, fontWeight: "900" },
  serviceDivider: { width: StyleSheet.hairlineWidth, height: 35, backgroundColor: "rgba(20,70,43,0.12)" },
  launchFooter: { position: "absolute", left: 24, right: 24, bottom: 28, gap: 8 },
  loadingTrack: { height: 4, borderRadius: 999, backgroundColor: "rgba(18,63,42,0.1)", overflow: "hidden" },
  loadingFill: { width: "68%", height: "100%", borderRadius: 999, backgroundColor: "#2F9A58" },
  loadingText: { color: "#748078", fontSize: 9, fontWeight: "800", textAlign: "center", letterSpacing: 0.3 },
});
