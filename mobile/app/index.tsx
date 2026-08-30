import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from "react-native";

import { useSession } from "../contexts/SessionContext";

export const STANDARD_LAUNCH_MS = 1250;
export const REDUCED_MOTION_LAUNCH_MS = 350;

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export default function IndexScreen() {
  const router = useRouter();
  const { user, loading } = useSession();
  const reveal = useRef(new Animated.Value(0)).current;
  const routeProgress = useRef(new Animated.Value(0)).current;
  const finish = useRef(new Animated.Value(0)).current;
  const launchedAt = useRef(Date.now());
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => { if (active) setReduceMotion(enabled); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    reveal.setValue(0); routeProgress.setValue(0); finish.setValue(0);
    const animation = reduceMotion
      ? Animated.sequence([Animated.timing(reveal, { toValue: 1, duration: 220, useNativeDriver: true }), Animated.timing(finish, { toValue: 1, duration: 100, useNativeDriver: true })])
      : Animated.sequence([Animated.timing(reveal, { toValue: 1, duration: 260, useNativeDriver: true }), Animated.timing(routeProgress, { toValue: 1, duration: 650, useNativeDriver: true }), Animated.timing(finish, { toValue: 1, duration: 180, useNativeDriver: true })]);
    animation.start();
    return () => animation.stop();
  }, [finish, reduceMotion, reveal, routeProgress]);

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
      if (remaining) await wait(remaining);
      if (active) router.replace(destination as never);
    }
    void decideRoute();
    return () => { active = false; };
  }, [loading, reduceMotion, router, user?.role]);

  const routeWidth = routeProgress.interpolate({ inputRange: [0, 1], outputRange: [0.08, 1] });
  const travel = routeProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 224] });
  const exitOpacity = finish.interpolate({ inputRange: [0, 1], outputRange: [1, 0.72] });

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.content, { opacity: Animated.multiply(reveal, exitOpacity), transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>
        <Text accessibilityRole="header" style={styles.wordmark}>Lets<Text style={styles.go}>Go</Text>Ride</Text>
        <Text style={styles.tagline}>MOVE · EAT · SEND</Text>
        <View accessibilityLabel="LetsGoRide is getting ready" style={styles.routeStage}>
          <View style={styles.routeBase} />
          <Animated.View style={[styles.routeActive, { transform: [{ scaleX: routeWidth }] }]} />
          <View style={styles.startPoint}><View style={styles.startCore} /></View>
          <Animated.View style={[styles.vehiclePoint, { transform: [{ translateX: reduceMotion ? 224 : travel }] }]} />
          <View style={styles.endPoint} />
        </View>
        <Text style={styles.copy}>Zimbabwe moves with LetsGoRide.</Text>
      </Animated.View>
      <Text style={styles.footer}>RIDE · FOOD · COURIER</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F7F4EC", alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
  content: { width: "100%", maxWidth: 360, alignItems: "center" },
  wordmark: { color: "#111111", fontSize: 42, lineHeight: 48, fontWeight: "900", letterSpacing: -2 },
  go: { color: "#23834A" },
  tagline: { marginTop: 6, color: "#686A66", fontSize: 9, fontWeight: "900", letterSpacing: 2.1 },
  routeStage: { width: 258, height: 54, marginTop: 44, justifyContent: "center" },
  routeBase: { position: "absolute", left: 14, right: 14, height: 2, borderRadius: 1, backgroundColor: "#D3D2CC" },
  routeActive: { position: "absolute", left: 14, width: 230, height: 2, borderRadius: 1, backgroundColor: "#111111" },
  startPoint: { position: "absolute", left: 7, width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: "#111111", backgroundColor: "#F7F4EC", alignItems: "center", justifyContent: "center" },
  startCore: { width: 4, height: 4, borderRadius: 2, backgroundColor: "#111111" },
  vehiclePoint: { position: "absolute", left: 10, width: 10, height: 10, borderRadius: 5, backgroundColor: "#111111", borderWidth: 2, borderColor: "#F7F4EC" },
  endPoint: { position: "absolute", right: 5, width: 18, height: 18, borderRadius: 5, backgroundColor: "#23834A", borderWidth: 3, borderColor: "#F7F4EC" },
  copy: { marginTop: 24, color: "#353733", fontSize: 13, fontWeight: "800" },
  footer: { position: "absolute", bottom: 34, color: "#9A9B96", fontSize: 8, fontWeight: "900", letterSpacing: 1.6 },
});
