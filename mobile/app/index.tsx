import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Dimensions, StyleSheet, Text, View } from "react-native";

import { useSession } from "../contexts/SessionContext";

export const STANDARD_LAUNCH_MS = 1900;
export const REDUCED_MOTION_LAUNCH_MS = 650;

const SCREEN_WIDTH = Dimensions.get("window").width;
const STAGE_WIDTH = Math.min(360, Math.max(300, SCREEN_WIDTH - 32));
const TRAVEL_DISTANCE = STAGE_WIDTH - 122;

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export default function IndexScreen() {
  const router = useRouter();
  const { user, loading } = useSession();
  const brandReveal = useRef(new Animated.Value(0)).current;
  const sceneReveal = useRef(new Animated.Value(0)).current;
  const routeProgress = useRef(new Animated.Value(0)).current;
  const journeyProgress = useRef(new Animated.Value(0)).current;
  const arrival = useRef(new Animated.Value(0)).current;
  const exitProgress = useRef(new Animated.Value(0)).current;
  const launchedAt = useRef(Date.now());
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => { if (active) setReduceMotion(enabled); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    [brandReveal, sceneReveal, routeProgress, journeyProgress, arrival, exitProgress].forEach((value) => value.setValue(0));
    const sequence = reduceMotion
      ? Animated.sequence([
        Animated.parallel([
          Animated.timing(brandReveal, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(sceneReveal, { toValue: 1, duration: 380, useNativeDriver: true }),
        ]),
        Animated.timing(arrival, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.timing(exitProgress, { toValue: 1, duration: 150, useNativeDriver: true }),
      ])
      : Animated.sequence([
        Animated.timing(brandReveal, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.timing(sceneReveal, { toValue: 1, duration: 240, useNativeDriver: true }),
        Animated.parallel([
          Animated.timing(routeProgress, { toValue: 1, duration: 860, useNativeDriver: true }),
          Animated.timing(journeyProgress, { toValue: 1, duration: 860, useNativeDriver: true }),
        ]),
        Animated.timing(arrival, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(exitProgress, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]);
    sequence.start();
    return () => sequence.stop();
  }, [arrival, brandReveal, exitProgress, journeyProgress, reduceMotion, routeProgress, sceneReveal]);

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

  const artworkExitStyle = {
    opacity: exitProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.08] }),
    transform: [{ translateY: exitProgress.interpolate({ inputRange: [0, 1], outputRange: [0, -16] }) }],
  };
  const scooterTravel = reduceMotion ? 0 : TRAVEL_DISTANCE;
  const journeyStyle = {
    transform: [
      { translateX: journeyProgress.interpolate({ inputRange: [0, 0.34, 0.7, 1], outputRange: [0, scooterTravel * 0.34, scooterTravel * 0.7, scooterTravel] }) },
      { translateY: journeyProgress.interpolate({ inputRange: [0, 0.34, 0.7, 1], outputRange: [8, -10, 5, -2] }) },
      { rotate: journeyProgress.interpolate({ inputRange: [0, 0.34, 0.7, 1], outputRange: ["-2deg", "-6deg", "3deg", "-1deg"] }) },
      { scale: sceneReveal.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
    ],
  };
  const wheelRotation = journeyProgress.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "720deg"] });

  return (
    <View style={styles.root}>
      <LinearGradient colors={["#FCF8EE", "#F5F1E6", "#EBF3E8"]} locations={[0, 0.58, 1]} style={StyleSheet.absoluteFill} />
      <View style={styles.sunGlow} />
      <Animated.View style={[styles.brand, {
        opacity: brandReveal,
        transform: [
          { translateY: brandReveal.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
          { scale: brandReveal.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) },
        ],
      }, artworkExitStyle]}>
        <Text accessibilityRole="header" style={styles.wordmark}>Lets<Text style={styles.wordmarkGo}>Go</Text>Ride</Text>
        <Text style={styles.tagline}>MOVE. EAT. SEND.</Text>
      </Animated.View>

      <Animated.View style={[styles.environment, {
        opacity: sceneReveal,
        transform: [{ translateX: journeyProgress.interpolate({ inputRange: [0, 1], outputRange: [0, reduceMotion ? 0 : -5] }) }],
      }, artworkExitStyle]}>
        <View style={styles.skylineBack}>
          <View style={[styles.building, styles.buildingOne]} />
          <View style={[styles.building, styles.buildingTwo]}><View style={styles.buildingAntenna} /></View>
          <View style={[styles.building, styles.buildingThree]} />
          <View style={[styles.building, styles.buildingFour]} />
          <View style={styles.treeOne}><View style={styles.treeCrown} /><View style={styles.treeTrunk} /></View>
          <View style={styles.treeTwo}><View style={styles.treeCrownSmall} /><View style={styles.treeTrunk} /></View>
        </View>
        <View style={styles.horizonLine} />
      </Animated.View>

      <Animated.View style={[styles.stage, { width: STAGE_WIDTH }, artworkExitStyle]}>
        <View style={styles.roadPlane} />
        <Animated.View style={[styles.pathSegment, styles.pathOne, {
          opacity: routeProgress.interpolate({ inputRange: [0, 0.24], outputRange: [0.08, 1], extrapolate: "clamp" }),
          transform: [{ scaleX: routeProgress.interpolate({ inputRange: [0, 0.35], outputRange: [0.15, 1], extrapolate: "clamp" }) }, { rotate: "-8deg" }],
        }]} />
        <Animated.View style={[styles.pathSegment, styles.pathTwo, {
          opacity: routeProgress.interpolate({ inputRange: [0.22, 0.58], outputRange: [0, 1], extrapolate: "clamp" }),
          transform: [{ scaleX: routeProgress.interpolate({ inputRange: [0.22, 0.62], outputRange: [0.1, 1], extrapolate: "clamp" }) }, { rotate: "7deg" }],
        }]} />
        <Animated.View style={[styles.pathSegment, styles.pathThree, {
          opacity: routeProgress.interpolate({ inputRange: [0.55, 0.92], outputRange: [0, 1], extrapolate: "clamp" }),
          transform: [{ scaleX: routeProgress.interpolate({ inputRange: [0.55, 1], outputRange: [0.1, 1], extrapolate: "clamp" }) }, { rotate: "-5deg" }],
        }]} />
        <View style={styles.routeDotOne} /><View style={styles.routeDotTwo} /><View style={styles.routeDotThree} />

        <Animated.View style={[styles.destination, {
          opacity: reduceMotion ? sceneReveal : arrival,
          transform: [{ scale: (reduceMotion ? sceneReveal : arrival).interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.72, 1.08, 1] }) }],
        }]}>
          <Animated.View style={[styles.pinRipple, {
            opacity: arrival.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 0.28, 0] }),
            transform: [{ scale: arrival.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.8] }) }],
          }]} />
          <View style={styles.pinHalo}><MaterialCommunityIcons name="map-marker" size={32} color="#17763D" /></View>
        </Animated.View>

        <Animated.View style={[styles.scooterJourney, reduceMotion && styles.scooterReduced, { opacity: sceneReveal }, journeyStyle]}>
          <ScooterIllustration wheelRotation={wheelRotation} />
        </Animated.View>
      </Animated.View>

      <Animated.View style={[styles.foreground, {
        opacity: sceneReveal,
        transform: [{ translateX: journeyProgress.interpolate({ inputRange: [0, 1], outputRange: [0, reduceMotion ? 0 : -9] }) }],
      }, artworkExitStyle]}>
        <View style={styles.foregroundLeafLeft} /><View style={styles.foregroundLeafRight} />
      </Animated.View>

      <Animated.Text style={[styles.finalCue, {
        opacity: arrival,
        transform: [{ translateY: arrival.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
      }, artworkExitStyle]}>LET’S GO</Animated.Text>
    </View>
  );
}

function ScooterIllustration({ wheelRotation }: { wheelRotation: Animated.AnimatedInterpolation<string> }) {
  return (
    <View style={styles.scooterArt}>
      <View style={styles.scooterShadow} />
      <Animated.View style={[styles.wheel, styles.rearWheel, { transform: [{ rotate: wheelRotation }] }]}><WheelDetail /></Animated.View>
      <Animated.View style={[styles.wheel, styles.frontWheel, { transform: [{ rotate: wheelRotation }] }]}><WheelDetail /></Animated.View>
      <View style={styles.deliveryBox}><Text style={styles.boxMark}>LGR</Text><View style={styles.boxHighlight} /></View>
      <View style={styles.seat} />
      <View style={styles.scooterChassis} />
      <LinearGradient colors={["#2AA45B", "#126837"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.scooterBody}>
        <View style={styles.bodyHighlight} />
      </LinearGradient>
      <View style={styles.frontFork} />
      <View style={styles.handleStem} />
      <View style={styles.handlebar} />
      <View style={styles.headlightGlow} /><View style={styles.headlight} />
      <View style={styles.riderBackLeg} /><View style={styles.riderFrontLeg} />
      <View style={styles.riderTorso}><View style={styles.jacketStripe} /></View>
      <View style={styles.riderArm} />
      <View style={styles.riderNeck} />
      <View style={styles.riderHead} />
      <View style={styles.helmet}><View style={styles.helmetHighlight} /><View style={styles.visor} /></View>
    </View>
  );
}

function WheelDetail() {
  return <><View style={styles.spokeVertical} /><View style={styles.spokeHorizontal} /><View style={styles.wheelHub} /></>;
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: "#FCF8EE" },
  sunGlow: { position: "absolute", top: "14%", right: -45, width: 190, height: 190, borderRadius: 95, backgroundColor: "rgba(235,170,74,0.08)" },
  brand: { position: "absolute", top: "18%", alignItems: "center" },
  wordmark: { color: "#141A16", fontSize: 38, lineHeight: 44, fontWeight: "900", letterSpacing: -1.8 },
  wordmarkGo: { color: "#23834A" },
  tagline: { marginTop: 5, color: "#667169", fontSize: 10, fontWeight: "900", letterSpacing: 2.25 },
  environment: { position: "absolute", left: 0, right: 0, bottom: "31%", height: 150 },
  skylineBack: { position: "absolute", left: 0, right: 0, bottom: 1, height: 120, opacity: 0.42 },
  building: { position: "absolute", bottom: 0, backgroundColor: "#C8D3C4", borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  buildingOne: { left: "4%", width: 46, height: 48 },
  buildingTwo: { left: "23%", width: 62, height: 72 },
  buildingThree: { right: "22%", width: 52, height: 55 },
  buildingFour: { right: "3%", width: 68, height: 83 },
  buildingAntenna: { position: "absolute", width: 2, height: 20, backgroundColor: "#B8C8B7", top: -20, left: 31 },
  treeOne: { position: "absolute", left: "46%", bottom: 0, width: 48, height: 68, alignItems: "center" },
  treeTwo: { position: "absolute", left: "66%", bottom: 0, width: 38, height: 51, alignItems: "center" },
  treeCrown: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#AFC6AE" },
  treeCrownSmall: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#B8CCB5" },
  treeTrunk: { width: 5, flex: 1, backgroundColor: "#A9B49E" },
  horizonLine: { position: "absolute", left: 0, right: 0, bottom: 0, height: 1, backgroundColor: "rgba(32,83,49,0.12)" },
  stage: { position: "absolute", bottom: "22%", height: 210 },
  roadPlane: { position: "absolute", left: -60, right: -60, bottom: 6, height: 92, borderRadius: 60, backgroundColor: "rgba(39,48,42,0.055)", transform: [{ rotate: "-2deg" }] },
  pathSegment: { position: "absolute", height: 48, borderRadius: 999, borderWidth: 0, borderTopWidth: 4, borderColor: "#2A9754", shadowColor: "#62C784", shadowOpacity: 0.22, shadowRadius: 5 },
  pathOne: { left: 13, bottom: 43, width: 112 },
  pathTwo: { left: 105, bottom: 54, width: 116, borderTopWidth: 0, borderBottomWidth: 4 },
  pathThree: { right: 22, bottom: 47, width: 104 },
  routeDotOne: { position: "absolute", right: 17, bottom: 74, width: 4, height: 4, borderRadius: 2, backgroundColor: "rgba(42,151,84,0.42)" },
  routeDotTwo: { position: "absolute", right: 8, bottom: 78, width: 3, height: 3, borderRadius: 2, backgroundColor: "rgba(42,151,84,0.28)" },
  routeDotThree: { position: "absolute", right: 0, bottom: 82, width: 2, height: 2, borderRadius: 1, backgroundColor: "rgba(42,151,84,0.18)" },
  destination: { position: "absolute", right: -2, bottom: 132, width: 48, height: 52, alignItems: "center", justifyContent: "center" },
  pinRipple: { position: "absolute", width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(235,158,58,0.28)" },
  pinHalo: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,253,247,0.9)", alignItems: "center", justifyContent: "center", shadowColor: "#1A743E", shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  scooterJourney: { position: "absolute", left: 1, bottom: 51, width: 116, height: 104 },
  scooterReduced: { left: (STAGE_WIDTH - 116) / 2, bottom: 48 },
  scooterArt: { width: 116, height: 104 },
  scooterShadow: { position: "absolute", left: 10, bottom: 2, width: 96, height: 12, borderRadius: 999, backgroundColor: "rgba(24,32,27,0.16)", transform: [{ scaleX: 1.08 }] },
  wheel: { position: "absolute", bottom: 4, width: 31, height: 31, borderRadius: 16, borderWidth: 5, borderColor: "#252B27", backgroundColor: "#F5F0E5", alignItems: "center", justifyContent: "center" },
  rearWheel: { left: 9 },
  frontWheel: { right: 5 },
  spokeVertical: { position: "absolute", width: 1, height: 20, backgroundColor: "#8B948D" },
  spokeHorizontal: { position: "absolute", width: 20, height: 1, backgroundColor: "#8B948D" },
  wheelHub: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#E49A36" },
  deliveryBox: { position: "absolute", left: 7, bottom: 47, width: 38, height: 34, borderRadius: 8, backgroundColor: "#E49A36", borderWidth: 2, borderColor: "#C8791F", alignItems: "center", justifyContent: "center", transform: [{ rotate: "-2deg" }] },
  boxMark: { color: "#173B29", fontSize: 9, fontWeight: "900", letterSpacing: -0.2 },
  boxHighlight: { position: "absolute", top: 3, left: 5, right: 5, height: 2, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.42)" },
  seat: { position: "absolute", left: 39, bottom: 42, width: 37, height: 9, borderRadius: 6, backgroundColor: "#232A25", transform: [{ rotate: "2deg" }] },
  scooterChassis: { position: "absolute", left: 25, bottom: 27, width: 69, height: 7, borderRadius: 5, backgroundColor: "#173A29", transform: [{ rotate: "2deg" }] },
  scooterBody: { position: "absolute", right: 19, bottom: 27, width: 46, height: 32, borderTopLeftRadius: 22, borderTopRightRadius: 10, borderBottomLeftRadius: 15, borderBottomRightRadius: 18, transform: [{ rotate: "-5deg" }], overflow: "hidden" },
  bodyHighlight: { position: "absolute", top: 6, right: 7, width: 23, height: 4, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.35)", transform: [{ rotate: "-8deg" }] },
  frontFork: { position: "absolute", right: 20, bottom: 18, width: 4, height: 43, borderRadius: 3, backgroundColor: "#183C2B", transform: [{ rotate: "-12deg" }] },
  handleStem: { position: "absolute", right: 26, bottom: 54, width: 4, height: 29, borderRadius: 3, backgroundColor: "#183C2B", transform: [{ rotate: "-9deg" }] },
  handlebar: { position: "absolute", right: 17, bottom: 80, width: 21, height: 4, borderRadius: 3, backgroundColor: "#252B27", transform: [{ rotate: "5deg" }] },
  headlightGlow: { position: "absolute", right: 10, bottom: 50, width: 19, height: 19, borderRadius: 10, backgroundColor: "rgba(240,169,69,0.18)" },
  headlight: { position: "absolute", right: 15, bottom: 55, width: 9, height: 9, borderRadius: 5, backgroundColor: "#FFD27C", borderWidth: 1, borderColor: "#E49A36" },
  riderBackLeg: { position: "absolute", left: 49, bottom: 27, width: 8, height: 32, borderRadius: 5, backgroundColor: "#25332A", transform: [{ rotate: "18deg" }] },
  riderFrontLeg: { position: "absolute", left: 65, bottom: 31, width: 8, height: 34, borderRadius: 5, backgroundColor: "#30453A", transform: [{ rotate: "-24deg" }] },
  riderTorso: { position: "absolute", left: 45, bottom: 55, width: 31, height: 36, borderRadius: 12, backgroundColor: "#1B7541", transform: [{ rotate: "8deg" }], overflow: "hidden" },
  jacketStripe: { position: "absolute", left: 4, right: 4, top: 16, height: 3, backgroundColor: "#E49A36", transform: [{ rotate: "-4deg" }] },
  riderArm: { position: "absolute", left: 68, bottom: 61, width: 8, height: 30, borderRadius: 5, backgroundColor: "#23884C", transform: [{ rotate: "-48deg" }] },
  riderNeck: { position: "absolute", left: 54, bottom: 88, width: 10, height: 8, borderRadius: 4, backgroundColor: "#9B6A49" },
  riderHead: { position: "absolute", left: 49, bottom: 92, width: 21, height: 20, borderRadius: 11, backgroundColor: "#A97754" },
  helmet: { position: "absolute", left: 46, bottom: 96, width: 29, height: 23, borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomLeftRadius: 8, borderBottomRightRadius: 12, backgroundColor: "#202822", transform: [{ rotate: "5deg" }] },
  helmetHighlight: { position: "absolute", left: 5, top: 4, width: 11, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.42)" },
  visor: { position: "absolute", right: -4, bottom: 3, width: 16, height: 7, borderTopRightRadius: 5, borderBottomRightRadius: 5, backgroundColor: "#6D7C73", opacity: 0.9 },
  foreground: { position: "absolute", left: 0, right: 0, bottom: 0, height: 130 },
  foregroundLeafLeft: { position: "absolute", left: -24, bottom: 18, width: 92, height: 38, borderRadius: 45, backgroundColor: "rgba(52,119,70,0.08)", transform: [{ rotate: "28deg" }] },
  foregroundLeafRight: { position: "absolute", right: -30, bottom: 38, width: 105, height: 42, borderRadius: 50, backgroundColor: "rgba(220,151,58,0.07)", transform: [{ rotate: "-21deg" }] },
  finalCue: { position: "absolute", bottom: "11%", color: "#667169", fontSize: 10, fontWeight: "900", letterSpacing: 2.4 },
});
