import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { AccessibilityInfo, Animated, Pressable, StatusBar, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { HailingMapBackdrop } from "../../components/hailing/HailingMapBackdrop";
import { BottomNav } from "../../components/layout/BottomNav";
import { Avatar } from "../../components/ui/Avatar";
import { VerifiedBadge, isIdentityVerified } from "../../components/ui/VerifiedBadge";
import { v2Theme } from "../../constants/v2Theme";
import { useNotifications } from "../../contexts/NotificationContext";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useDriver } from "../../hooks/useDriver";
import { useHailingDriverWorkspace } from "../../hooks/useHailing";
import { firstNameOrFallback } from "../../utils/displayName";
import { isPendingVerificationStatus, isVerifiedStatus } from "../../utils/verificationStatus";

const DRIVER_BLACK = "#111111";

type HomeAction = {
  key: string;
  eyebrow: string;
  title: string;
  body: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  route: string;
  step?: string;
  pending?: boolean;
};

export default function DriverHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { unreadCount } = useNotifications();
  const { user, reload: reloadUser } = useCurrentUser();
  const { driver, reload: reloadDriver } = useDriver();
  const { status: hailingStatus, offer: hailingOffer } = useHailingDriverWorkspace(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const intro = useRef(new Animated.Value(1)).current;

  const firstName = firstNameOrFallback(user?.name);
  const serviceArea = String(user?.city || "Zimbabwe");
  const identityVerified = isIdentityVerified(user) || isVerifiedStatus(driver?.verification_status);
  const online = Boolean(hailingStatus?.online);
  const activeTrip = hailingStatus?.active_trip;
  const photoApproved = user?.profile_photo_verified === true;
  const photoPending = user?.profile_photo_review_status === "pending";
  const photoRejected = user?.profile_photo_review_status === "rejected";
  const vehicleAdded = Boolean(driver?.vehicle);
  const dockBottom = v2Theme.control.navHeight + Math.max(insets.bottom, 10) + 18;

  useFocusEffect(useCallback(() => {
    void reloadUser();
    void reloadDriver();
  }, [reloadDriver, reloadUser]));

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => undefined);
  }, []);

  const nextAction = useMemo<HomeAction>(() => {
    if (hailingOffer) {
      return {
        key: `offer-${hailingOffer.id}`,
        eyebrow: "RIDE REQUEST",
        title: "New nearby ride",
        body: "Open the request to review pickup, destination and fare.",
        icon: "car-clock",
        route: "/(driver)/hailing",
      };
    }
    if (activeTrip?.id) {
      return {
        key: `trip-${activeTrip.id}`,
        eyebrow: "ACTIVE RIDE",
        title: "Continue your ride",
        body: "Your active trip is ready on the map.",
        icon: "navigation-variant-outline",
        route: `/(driver)/hailing/trip/${activeTrip.id}`,
      };
    }
    if (!photoApproved) {
      if (photoPending) {
        return {
          key: "photo-pending",
          eyebrow: "REQUIRED ACTION",
          title: "Photo under review",
          body: "Your photo is with Admin. You can stay on Home while it is reviewed.",
          icon: "clock-outline",
          route: "/(driver)/account",
          step: "STEP 1 OF 3",
          pending: true,
        };
      }
      return {
        key: photoRejected ? "photo-rejected" : "photo-missing",
        eyebrow: "REQUIRED ACTION",
        title: photoRejected ? "Replace your profile photo" : "Add your profile photo",
        body: photoRejected ? "Use a clear photo of yourself so Admin can approve it." : "Start with one clear photo of yourself. We will show the next step after this.",
        icon: photoRejected ? "account-alert-outline" : "camera-plus-outline",
        route: "/(shared)/edit-profile?product=driver",
        step: "STEP 1 OF 3",
      };
    }
    if (!vehicleAdded) {
      return {
        key: "vehicle-missing",
        eyebrow: "REQUIRED ACTION",
        title: "Add your vehicle",
        body: "Choose the vehicle type and add the basic car details. No vehicle registration document is requested here.",
        icon: "car-outline",
        route: "/(driver)/vehicle-setup",
        step: "STEP 2 OF 3",
      };
    }
    if (!identityVerified) {
      const pending = isPendingVerificationStatus(driver?.verification_status || user?.verification_status || "not_started");
      return {
        key: pending ? "verification-pending" : "verification-required",
        eyebrow: "REQUIRED ACTION",
        title: pending ? "Verification under review" : "Finish Driver verification",
        body: pending ? "Your identity checks are with Admin. We will notify you when the review is complete." : "Capture your identity document, driver licence and live selfie. Then you are ready for review.",
        icon: pending ? "clock-check-outline" : "shield-account-outline",
        route: "/(shared)/verification",
        step: "STEP 3 OF 3",
        pending,
      };
    }
    return {
      key: online ? "ride-online" : "ride-offline",
      eyebrow: "RIDE NOW",
      title: online ? "You’re online" : "Ready to drive",
      body: online ? "LetsGoRide is listening for nearby passenger requests." : "Go online when you’re ready to accept nearby Ride Now requests.",
      icon: online ? "car-connected" : "car-arrow-right",
      route: "/(driver)/hailing",
    };
  }, [activeTrip?.id, driver?.verification_status, hailingOffer, identityVerified, online, photoApproved, photoPending, photoRejected, user?.verification_status, vehicleAdded]);

  useEffect(() => {
    if (reduceMotion) {
      intro.setValue(1);
      return;
    }
    intro.setValue(0);
    Animated.spring(intro, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 180, mass: 0.8 }).start();
  }, [intro, nextAction.key, reduceMotion]);

  function openNextAction() {
    router.push(nextAction.route as never);
  }

  return (
    <SafeAreaView edges={[]} style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <HailingMapBackdrop bottomPadding={300} />
      <View pointerEvents="none" style={styles.mapMood} />

      <View pointerEvents="box-none" style={[styles.topBar, { top: insets.top + 8 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Open Driver account" onPress={() => router.push("/(driver)/account" as never)} style={({ pressed }) => [styles.identityPill, pressed && styles.pressed]}>
          <Avatar name={user?.name || firstName} imageUri={user?.profile_photo_url} size={36} tone="neutral" />
          <View style={styles.identityCopy}>
            <View style={styles.nameLine}>
              <Text numberOfLines={1} style={styles.name}>{firstName}</Text>
              <VerifiedBadge verified={identityVerified} />
            </View>
            <Text numberOfLines={1} style={styles.identityMeta}>Driver · {serviceArea}</Text>
          </View>
        </Pressable>

        <Pressable accessibilityRole="button" accessibilityLabel="Notifications" hitSlop={8} onPress={() => router.push({ pathname: "/(shared)/notifications", params: { product: "driver" } } as never)} style={({ pressed }) => [styles.bellButton, pressed && styles.pressed]}>
          <MaterialCommunityIcons name="bell-outline" size={21} color={DRIVER_BLACK} />
          {unreadCount ? <View style={styles.badge}><Text style={styles.badgeText}>{unreadCount > 99 ? "99+" : unreadCount}</Text></View> : null}
        </Pressable>
      </View>

      <View pointerEvents="none" style={styles.mapStatus}>
        <View style={[styles.liveDot, online && styles.liveDotOnline]} />
        <Text style={styles.mapStatusText}>{online ? "ONLINE" : "OFFLINE"}</Text>
      </View>

      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.dock,
          { bottom: dockBottom },
          { opacity: intro, transform: [{ translateY: intro.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] },
        ]}
      >
        <Pressable accessibilityRole="button" accessibilityLabel={nextAction.title} onPress={openNextAction} style={({ pressed }) => [styles.actionCard, pressed && styles.primaryPressed]}>
          <View style={[styles.actionIcon, nextAction.pending && styles.actionIconPending]}>
            <MaterialCommunityIcons name={nextAction.icon} size={25} color={DRIVER_BLACK} />
          </View>
          <View style={styles.flex}>
            <View style={styles.eyebrowRow}>
              <Text style={styles.eyebrow}>{nextAction.eyebrow}</Text>
              {nextAction.step ? <Text style={styles.step}>{nextAction.step}</Text> : null}
            </View>
            <Text style={styles.actionTitle}>{nextAction.title}</Text>
            <Text style={styles.actionBody}>{nextAction.body}</Text>
          </View>
          <View style={styles.arrow}><MaterialCommunityIcons name="arrow-right" size={20} color={DRIVER_BLACK} /></View>
        </Pressable>
      </Animated.View>

      <BottomNav role="driver" bottomOffset={Math.max(insets.bottom, 10)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F0EEE8" },
  flex: { flex: 1 },
  mapMood: { ...StyleSheet.absoluteFillObject, zIndex: 1, backgroundColor: "rgba(17,17,17,0.018)" },
  topBar: { position: "absolute", left: 14, right: 14, zIndex: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  identityPill: { minHeight: 50, maxWidth: "78%", paddingLeft: 6, paddingRight: 13, borderRadius: 25, backgroundColor: "rgba(255,255,255,0.96)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(17,17,17,0.10)", flexDirection: "row", alignItems: "center", gap: 9, shadowColor: "#000000", shadowOpacity: 0.09, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 5 },
  identityCopy: { flex: 1, gap: 1 },
  nameLine: { flexDirection: "row", alignItems: "center", gap: 4 },
  name: { flexShrink: 1, color: DRIVER_BLACK, fontSize: 14, fontWeight: "900" },
  identityMeta: { color: v2Theme.colors.inkSecondary, fontSize: 9, fontWeight: "800" },
  bellButton: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.96)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(17,17,17,0.10)", shadowColor: "#000000", shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 5 },
  badge: { position: "absolute", top: 3, right: 3, minWidth: 17, height: 17, paddingHorizontal: 3, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: v2Theme.colors.danger },
  badgeText: { color: "#FFFFFF", fontSize: 8, fontWeight: "900" },
  mapStatus: { position: "absolute", zIndex: 4, top: "28%", alignSelf: "center", minHeight: 38, paddingHorizontal: 15, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.90)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(17,17,17,0.08)", flexDirection: "row", alignItems: "center", gap: 7 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: v2Theme.colors.inkTertiary },
  liveDotOnline: { backgroundColor: DRIVER_BLACK },
  mapStatusText: { color: DRIVER_BLACK, fontSize: 9, fontWeight: "900", letterSpacing: 0.9 },
  dock: { position: "absolute", zIndex: 10, left: 14, right: 14 },
  actionCard: { minHeight: 112, borderRadius: 30, backgroundColor: DRIVER_BLACK, paddingHorizontal: 14, paddingVertical: 14, flexDirection: "row", alignItems: "center", gap: 12, shadowColor: "#000000", shadowOpacity: 0.19, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 10 },
  actionIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  actionIconPending: { backgroundColor: "#F1F1ED" },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  eyebrow: { color: "rgba(255,255,255,0.72)", fontSize: 8, fontWeight: "900", letterSpacing: 1.05 },
  step: { color: "rgba(255,255,255,0.48)", fontSize: 8, fontWeight: "800" },
  actionTitle: { color: "#FFFFFF", fontSize: 19, lineHeight: 23, fontWeight: "900", letterSpacing: -0.45, marginTop: 2 },
  actionBody: { color: "rgba(255,255,255,0.66)", fontSize: 10, lineHeight: 15, marginTop: 3 },
  arrow: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  primaryPressed: { opacity: 0.94, transform: [{ scale: 0.994 }] },
  pressed: { opacity: 0.72 },
});
