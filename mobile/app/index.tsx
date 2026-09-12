import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from "react-native";

import { useSession } from "../contexts/SessionContext";
import { homeRouteForRole } from "../navigation/roleRoutes";

const INTRO_BACKGROUND = require("../assets/branding/intro-bg.jpg");
const INTRO_WORDMARK = require("../assets/branding/intro-wordmark.png");
const INTRO_SUBCOPY = require("../assets/branding/intro-subcopy.png");
const INTRO_TAGLINE = require("../assets/branding/intro-tagline.png");

export const STANDARD_LAUNCH_MS = 1350;
export const REDUCED_MOTION_LAUNCH_MS = 350;

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export default function IndexScreen() {
  const router = useRouter();
  const { user, loading } = useSession();
  const launchedAt = useRef(Date.now());
  const [reduceMotion, setReduceMotion] = useState(false);

  const sceneOpacity = useRef(new Animated.Value(0)).current;
  const sceneScale = useRef(new Animated.Value(1.04)).current;
  const wordmarkOpacity = useRef(new Animated.Value(0)).current;
  const wordmarkY = useRef(new Animated.Value(10)).current;
  const subcopyOpacity = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const screenOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(enabled);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    sceneOpacity.setValue(0);
    sceneScale.setValue(reduceMotion ? 1 : 1.04);
    wordmarkOpacity.setValue(0);
    wordmarkY.setValue(reduceMotion ? 0 : 10);
    subcopyOpacity.setValue(0);
    taglineOpacity.setValue(0);
    screenOpacity.setValue(1);

    const smoothOut = Easing.out(Easing.cubic);
    const animation = reduceMotion
      ? Animated.parallel([
          Animated.timing(sceneOpacity, {
            toValue: 1,
            duration: 220,
            easing: smoothOut,
            useNativeDriver: true,
          }),
          Animated.timing(wordmarkOpacity, {
            toValue: 1,
            duration: 220,
            easing: smoothOut,
            useNativeDriver: true,
          }),
          Animated.timing(subcopyOpacity, {
            toValue: 1,
            duration: 220,
            easing: smoothOut,
            useNativeDriver: true,
          }),
          Animated.timing(taglineOpacity, {
            toValue: 1,
            duration: 220,
            easing: smoothOut,
            useNativeDriver: true,
          }),
        ])
      : Animated.parallel([
          Animated.timing(sceneOpacity, {
            toValue: 1,
            duration: 450,
            easing: smoothOut,
            useNativeDriver: true,
          }),
          Animated.timing(sceneScale, {
            toValue: 1,
            duration: 1200,
            easing: smoothOut,
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.delay(250),
            Animated.parallel([
              Animated.timing(wordmarkOpacity, {
                toValue: 1,
                duration: 500,
                easing: smoothOut,
                useNativeDriver: true,
              }),
              Animated.timing(wordmarkY, {
                toValue: 0,
                duration: 500,
                easing: smoothOut,
                useNativeDriver: true,
              }),
            ]),
          ]),
          Animated.sequence([
            Animated.delay(500),
            Animated.timing(subcopyOpacity, {
              toValue: 1,
              duration: 450,
              easing: smoothOut,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.delay(850),
            Animated.timing(taglineOpacity, {
              toValue: 1,
              duration: 250,
              easing: smoothOut,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.delay(1150),
            Animated.timing(screenOpacity, {
              toValue: 0,
              duration: 200,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
        ]);

    animation.start();
    return () => animation.stop();
  }, [
    reduceMotion,
    sceneOpacity,
    sceneScale,
    screenOpacity,
    subcopyOpacity,
    taglineOpacity,
    wordmarkOpacity,
    wordmarkY,
  ]);

  useEffect(() => {
    if (loading) return undefined;

    let active = true;
    async function decideRoute() {
      const destination = homeRouteForRole(user?.role);
      const launchMs = reduceMotion ? REDUCED_MOTION_LAUNCH_MS : STANDARD_LAUNCH_MS;
      const remaining = Math.max(0, launchMs - (Date.now() - launchedAt.current));
      if (remaining) await wait(remaining);
      if (active) router.replace(destination as never);
    }

    void decideRoute();
    return () => {
      active = false;
    };
  }, [loading, reduceMotion, router, user?.role]);

  return (
    <View
      accessibilityLabel="LetsGoRide Zimbabwe. People, places, possibilities."
      style={styles.root}
    >
      <StatusBar hidden />
      <Animated.View style={[styles.stage, { opacity: screenOpacity }]}>
        <Animated.Image
          source={INTRO_BACKGROUND}
          resizeMode="cover"
          style={[
            styles.fullFrame,
            {
              opacity: sceneOpacity,
              transform: [{ scale: sceneScale }],
            },
          ]}
        />
        <View pointerEvents="none" style={styles.cinematicWash} />
        <Animated.Image
          source={INTRO_WORDMARK}
          resizeMode="cover"
          style={[
            styles.fullFrame,
            {
              opacity: wordmarkOpacity,
              transform: [{ translateY: wordmarkY }],
            },
          ]}
        />
        <Animated.Image
          source={INTRO_SUBCOPY}
          resizeMode="cover"
          style={[styles.fullFrame, { opacity: subcopyOpacity }]}
        />
        <Animated.Image
          source={INTRO_TAGLINE}
          resizeMode="cover"
          style={[styles.fullFrame, { opacity: taglineOpacity }]}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0B0F14",
  },
  stage: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0B0F14",
    overflow: "hidden",
  },
  fullFrame: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  cinematicWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5, 9, 13, 0.05)",
  },
});
