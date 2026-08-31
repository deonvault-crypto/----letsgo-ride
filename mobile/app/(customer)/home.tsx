import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  PanResponder,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { HailingMapBackdrop } from "../../components/hailing/HailingMapBackdrop";
import { BottomNav } from "../../components/layout/BottomNav";
import { BrandLogo } from "../../components/layout/BrandLogo";
import { v2Theme } from "../../constants/v2Theme";
import { useNotifications } from "../../contexts/NotificationContext";
import { useActiveHailingTrip, useHailingConfig } from "../../hooks/useHailing";
import { useRides } from "../../hooks/useRides";
import { isRideBookable } from "../../utils/tripLifecycle";

type CanvasMode = "ride" | "food" | "courier";

type ModeMeta = {
  label: string;
  eyebrow: string;
  title: string;
  body: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  mapTint: string;
};

const MODE_ORDER: CanvasMode[] = ["ride", "food", "courier"];
const SHEET_BOTTOM = v2Theme.control.navHeight + 24;
const TERMINAL_HAILING = new Set([
  "COMPLETED",
  "CANCELLED_BY_PASSENGER",
  "CANCELLED_BY_DRIVER",
  "CANCELLED_BY_ADMIN",
  "NO_DRIVER_FOUND",
]);

const MODE_META: Record<CanvasMode, ModeMeta> = {
  ride: {
    label: "Ride",
    eyebrow: "RIDE NOW",
    title: "Where to?",
    body: "Pickup → destination",
    icon: "magnify",
    mapTint: "rgba(17,17,17,0.015)",
  },
  food: {
    label: "Food",
    eyebrow: "FOOD",
    title: "Search cuisines",
    body: "Restaurants, kitchens and dishes near you",
    icon: "silverware-fork-knife",
    mapTint: "rgba(242,153,74,0.12)",
  },
  courier: {
    label: "Courier",
    eyebrow: "COURIER",
    title: "Send a package",
    body: "Pickup, destination and live tracking",
    icon: "package-variant-closed",
    mapTint: "rgba(22,163,74,0.07)",
  },
};

export default function CustomerHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { unreadCount } = useNotifications();
  const { rides, loading } = useRides();
  const { config: hailingConfig } = useHailingConfig();
  const { trip: activeHailingTrip } = useActiveHailingTrip(false);
  const [mode, setMode] = useState<CanvasMode>("ride");
  const [hasSwiped, setHasSwiped] = useState(false);
  const modeRef = useRef<CanvasMode>("ride");
  const reduceMotionRef = useRef(false);
  const dragX = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const moodOpacity = useRef(new Animated.Value(1)).current;

  modeRef.current = mode;

  const hailingEnabled = hailingConfig?.enabled !== false;
  const activeHailing = Boolean(
    activeHailingTrip && !TERMINAL_HAILING.has(activeHailingTrip.status),
  );
  const upcomingRideCount = rides.filter((ride) => isRideBookable(ride)).length;
  const meta = MODE_META[mode];

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) reduceMotionRef.current = enabled;
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
      reduceMotionRef.current = enabled;
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  function animateBack() {
    if (reduceMotionRef.current) {
      dragX.setValue(0);
      return;
    }
    Animated.spring(dragX, {
      toValue: 0,
      useNativeDriver: true,
      speed: 24,
      bounciness: 4,
    }).start();
  }

  function selectMode(next: CanvasMode) {
    if (next === modeRef.current) {
      animateBack();
      return;
    }

    modeRef.current = next;
    setHasSwiped(true);
    if (reduceMotionRef.current) {
      setMode(next);
      dragX.setValue(0);
      contentOpacity.setValue(1);
      moodOpacity.setValue(1);
      return;
    }

    contentOpacity.stopAnimation();
    moodOpacity.stopAnimation();
    contentOpacity.setValue(0.2);
    moodOpacity.setValue(0);
    dragX.setValue(next === "food" ? 18 : next === "courier" ? 24 : -18);
    setMode(next);

    Animated.parallel([
      Animated.spring(dragX, {
        toValue: 0,
        useNativeDriver: true,
        speed: 24,
        bounciness: 4,
      }),
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 170,
        useNativeDriver: true,
      }),
      Animated.timing(moodOpacity, {
        toValue: 1,
        duration: 260,
        useNativeDriver: true,
      }),
    ]).start();
  }

  function shiftMode(direction: -1 | 1) {
    const index = MODE_ORDER.indexOf(modeRef.current);
    const nextIndex = Math.max(0, Math.min(MODE_ORDER.length - 1, index + direction));
    selectMode(MODE_ORDER[nextIndex]);
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderMove: (_, gesture) => {
        if (!reduceMotionRef.current) dragX.setValue(Math.max(-72, Math.min(72, gesture.dx * 0.42)));
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx < -46) shiftMode(1);
        else if (gesture.dx > 46) shiftMode(-1);
        else animateBack();
      },
      onPanResponderTerminate: animateBack,
    }),
  ).current;

  function openRideNow() {
    if (!hailingEnabled) {
      router.push("/(shared)/services" as never);
      return;
    }
    if (!activeHailing || !activeHailingTrip) {
      router.push("/(shared)/location-picker?kind=dropoff&flow=hailing&focus=1" as never);
      return;
    }
    if (activeHailingTrip.status === "SEARCHING") {
      router.push(
        `/(customer)/hail/searching?tripId=${encodeURIComponent(activeHailingTrip.id)}` as never,
      );
      return;
    }
    router.push(`/(customer)/hail/trip/${activeHailingTrip.id}` as never);
  }

  function openPrimaryAction() {
    if (mode === "ride") {
      openRideNow();
      return;
    }
    if (mode === "food") {
      router.push("/(customer)/food" as never);
      return;
    }
    router.push("/(shared)/courier" as never);
  }

  function openContextAction() {
    if (mode === "ride") {
      router.push("/(shared)/services" as never);
      return;
    }
    if (mode === "food") {
      router.push("/(customer)/food" as never);
      return;
    }
    router.push("/(shared)/courier" as never);
  }

  const primaryEyebrow =
    mode === "ride" && activeHailing ? "ACTIVE RIDE" : meta.eyebrow;
  const primaryTitle =
    mode === "ride" && activeHailing
      ? "Continue your ride"
      : mode === "ride" && !hailingEnabled
        ? "Ride Now unavailable"
        : meta.title;
  const primaryBody =
    mode === "ride" && activeHailing && activeHailingTrip
      ? activeHailingTrip.status.replaceAll("_", " ")
      : mode === "ride" && !hailingEnabled
        ? "Open Services for other travel options"
        : meta.body;

  return (
    <SafeAreaView edges={[]} style={styles.root}>
      <StatusBar barStyle="dark-content" />

      <HailingMapBackdrop
        bottomPadding={330}
        showCurrentLocation
        promptForLocation
        showLocateControl
      />
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.mapMood,
          { backgroundColor: meta.mapTint, opacity: moodOpacity },
        ]}
      />

      <View pointerEvents="box-none" style={[styles.topBar, { top: insets.top + 8 }]}>
        <View style={styles.brandCapsule}>
          <BrandLogo size="small" />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          hitSlop={8}
          onPress={() => router.push("/(shared)/notifications" as never)}
          style={({ pressed }) => [styles.bellButton, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="bell-outline" size={21} color="#111111" />
          {unreadCount ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <View pointerEvents="box-none" style={[styles.canvasDock, { bottom: SHEET_BOTTOM + Math.max(insets.bottom, 0) }]}>
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.primaryCardWrap,
            {
              transform: [
                { translateX: dragX },
                {
                  scale: dragX.interpolate({
                    inputRange: [-72, 0, 72],
                    outputRange: [0.985, 1, 0.985],
                  }),
                },
              ],
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={primaryTitle}
            accessibilityHint={`Opens ${meta.label} service`}
            onPress={openPrimaryAction}
            style={({ pressed }) => [styles.primaryCard, pressed && styles.primaryPressed]}
          >
            <Animated.View style={[styles.primaryInner, { opacity: contentOpacity }]}>
              <View style={[styles.primaryIcon, mode === "food" && styles.foodIcon, mode === "courier" && styles.courierIcon]}>
                <MaterialCommunityIcons
                  name={mode === "ride" && activeHailing ? "car-clock" : meta.icon}
                  size={22}
                  color="#111111"
                />
              </View>
              <View style={styles.primaryCopy}>
                <Text style={styles.primaryEyebrow}>{primaryEyebrow}</Text>
                <Text numberOfLines={1} style={styles.primaryTitle}>{primaryTitle}</Text>
                <Text numberOfLines={1} style={styles.primaryBody}>{primaryBody}</Text>
              </View>
              <View style={styles.primaryArrow}>
                <MaterialCommunityIcons name="arrow-right" size={20} color="#FFFFFF" />
              </View>
            </Animated.View>
          </Pressable>
        </Animated.View>

        <View style={styles.modeRail}>
          <Text style={styles.modeHint}>{hasSwiped ? meta.label : "Swipe services"}</Text>
          <View style={styles.modeDots}>
            {MODE_ORDER.map((item) => {
              const active = item === mode;
              return (
                <Pressable
                  key={item}
                  accessibilityRole="button"
                  accessibilityLabel={`Switch to ${MODE_META[item].label}`}
                  accessibilityState={{ selected: active }}
                  hitSlop={8}
                  onPress={() => selectMode(item)}
                  style={[styles.modeDotHit, active && styles.modeDotHitActive]}
                >
                  <View style={[styles.modeDot, active && styles.modeDotActive]} />
                </Pressable>
              );
            })}
          </View>
        </View>

        {mode !== "ride" ? (
          <Pressable
            accessibilityRole="button"
            onPress={openContextAction}
            style={({ pressed }) => [styles.contextCard, pressed && styles.pressed]}
          >
            <View style={styles.contextIcon}>
              <MaterialCommunityIcons
                name={
                  mode === "ride"
                    ? "road-variant"
                    : mode === "food"
                      ? "storefront-outline"
                      : "map-marker-path"
                }
                size={19}
                color={v2Theme.colors.inkSecondary}
              />
            </View>
            <View style={styles.contextCopy}>
              <Text style={styles.contextTitle}>
                {mode === "ride"
                  ? "Intercity / Scheduled"
                  : mode === "food"
                    ? "Explore nearby food"
                    : "Start a delivery"}
              </Text>
              <Text numberOfLines={1} style={styles.contextBody}>
                {mode === "ride"
                  ? loading
                    ? "Checking available trips…"
                    : `${upcomingRideCount} bookable ${upcomingRideCount === 1 ? "ride" : "rides"} available`
                  : mode === "food"
                    ? "Restaurants, kitchens and dishes"
                    : "Parcels with live tracking"}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={v2Theme.colors.inkTertiary} />
          </Pressable>
        ) : null}
      </View>

      <BottomNav
        role="customer"
        activeLabel={mode === "ride" ? "Home" : "Services"}
        bottomOffset={Math.max(insets.bottom, 10)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F1EEE8",
  },
  mapMood: {
    zIndex: 1,
  },
  topBar: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brandCapsule: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.94)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(17,17,17,0.10)",
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  bellButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(17,17,17,0.10)",
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  badge: {
    position: "absolute",
    top: 3,
    right: 3,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 3,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: v2Theme.colors.danger,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 8,
    fontWeight: "900",
  },
  canvasDock: {
    position: "absolute",
    zIndex: 10,
    left: 14,
    right: 14,
    gap: 8,
  },
  primaryCardWrap: {
    borderRadius: 26,
  },
  primaryCard: {
    minHeight: 88,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(17,17,17,0.10)",
    paddingHorizontal: 12,
    paddingVertical: 11,
    shadowColor: "#000000",
    shadowOpacity: 0.15,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  primaryInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  primaryPressed: {
    transform: [{ scale: 0.992 }],
    opacity: 0.94,
  },
  primaryIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: "#EAF8EE",
    alignItems: "center",
    justifyContent: "center",
  },
  foodIcon: {
    backgroundColor: "#FFF0DE",
  },
  courierIcon: {
    backgroundColor: "#E9F7EE",
  },
  primaryCopy: {
    flex: 1,
    gap: 1,
  },
  primaryEyebrow: {
    color: v2Theme.colors.brandStrong,
    fontSize: 8,
    lineHeight: 11,
    fontWeight: "900",
    letterSpacing: 1.05,
  },
  primaryTitle: {
    color: "#111111",
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "900",
    letterSpacing: -0.7,
  },
  primaryBody: {
    color: v2Theme.colors.inkSecondary,
    fontSize: 10,
    lineHeight: 14,
  },
  primaryArrow: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
  },
  modeRail: {
    minHeight: 24,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modeHint: {
    color: "rgba(17,17,17,0.62)",
    fontSize: 10,
    fontWeight: "800",
  },
  modeDots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  modeDotHit: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  modeDotHitActive: {
    width: 30,
  },
  modeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(17,17,17,0.24)",
  },
  modeDotActive: {
    width: 16,
    backgroundColor: "#111111",
  },
  contextCard: {
    minHeight: 60,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.91)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(17,17,17,0.08)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    shadowColor: "#000000",
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 5,
  },
  contextIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(17,17,17,0.08)",
  },
  contextCopy: {
    flex: 1,
    gap: 1,
  },
  contextTitle: {
    color: "#111111",
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "900",
  },
  contextBody: {
    color: v2Theme.colors.inkSecondary,
    fontSize: 9,
    lineHeight: 13,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.99 }],
  },
});