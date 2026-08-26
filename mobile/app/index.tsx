import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from "react-native";

import { Screen } from "../components/ui/Screen";
import { useSession } from "../contexts/SessionContext";

export const STANDARD_LAUNCH_MS = 1900;
export const REDUCED_MOTION_LAUNCH_MS = 650;

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export default function IndexScreen() {
  const router = useRouter();
  const { user, loading } = useSession();
  const entrance = useRef(new Animated.Value(0)).current;
  const serviceReveal = useRef(new Animated.Value(0)).current;
  const routeProgress = useRef(new Animated.Value(0)).current;
  const launchedAt = useRef(Date.now());
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => { if (active) setReduceMotion(enabled); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const sequence = Animated.sequence([
      Animated.spring(entrance, {
        toValue: 1,
        damping: 18,
        stiffness: 170,
        mass: 0.85,
        useNativeDriver: true,
      }),
      Animated.parallel([Animated.timing(serviceReveal, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }), Animated.timing(routeProgress, {
        toValue: 1,
        duration: reduceMotion ? 180 : 760,
        useNativeDriver: true,
      })]),
    ]);
    sequence.start();
    return () => sequence.stop();

  }, [entrance, reduceMotion, routeProgress, serviceReveal]);

  useEffect(() => {
    if (loading) return undefined;
    let active = true;
    async function decideRoute() {
      let destination = "/(customer)/home";
      if (user?.role === "admin") destination = "/(admin)/dashboard";
      else if (user?.role === "driver") destination = "/(driver)/home";
      else if (user?.role === "courier") destination = "/(courier)/home";
      else if (user?.role === "merchant") destination = "/(merchant)/home";

      const launchMs = reduceMotion ? REDUCED_MOTION_LAUNCH_MS : STANDARD_LAUNCH_MS;
      const remaining = Math.max(0, launchMs - (Date.now() - launchedAt.current));
      if (remaining > 0) await wait(remaining);
      if (active) router.replace(destination as never);
    }
    void decideRoute();
    return () => { active = false; };
  }, [loading, reduceMotion, router, user?.role]);

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

        <Animated.View style={[styles.routeCard, { opacity: serviceReveal }]}>
          <View style={styles.routeLine}><View style={styles.routeStart} /><View style={styles.routeEnd}><MaterialCommunityIcons name="map-marker" size={18} color="#25844B" /></View></View>
          <Animated.View style={[styles.vehicle, { transform: [{ translateX: routeProgress.interpolate({ inputRange: [0, 1], outputRange: [0, reduceMotion ? 8 : 184] }) }] }]}>
            <MaterialCommunityIcons name="moped" size={25} color="#FFFFFF" />
          </Animated.View>
          <Text style={styles.routeText}>Getting things ready</Text>
        </Animated.View>

        <View style={styles.launchFooter}>
          <Text style={styles.loadingText}>Let’s Go</Text>
        </View>
      </LinearGradient>
    </Screen>
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
  routeCard: { marginTop: 36, width: 264, alignSelf: "center", minHeight: 88, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.72)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(20,70,43,0.12)", paddingHorizontal: 22, paddingTop: 22 },
  routeLine: { height: 2, marginTop: 15, backgroundColor: "rgba(37,132,75,0.22)", flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  routeStart: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#25844B" },
  routeEnd: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#E7F5EB", alignItems: "center", justifyContent: "center" },
  vehicle: { position: "absolute", left: 14, top: 8, width: 38, height: 38, borderRadius: 15, backgroundColor: "#123F2A", alignItems: "center", justifyContent: "center", shadowColor: "#123F2A", shadowOpacity: 0.18, shadowRadius: 8, elevation: 4 },
  routeText: { marginTop: 16, color: "#5B675F", fontSize: 10, fontWeight: "800", textAlign: "center" },
  launchFooter: { position: "absolute", left: 24, right: 24, bottom: 28, gap: 8 },
  loadingText: { color: "#748078", fontSize: 9, fontWeight: "800", textAlign: "center", letterSpacing: 0.3 },
});
